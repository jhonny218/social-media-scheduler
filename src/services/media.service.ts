import { v4 as uuidv4 } from 'uuid';
import { supabase, TABLES } from '../config/supabase';
import { getCdnUrl, isBunnyConfigured } from '../config/bunny';
import { MediaItem, MediaType } from '../types';

export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbRowToMediaItem = (row: any): MediaItem => {
  // Use download_url from database if it's valid, otherwise generate from storage_path
  let downloadUrl = row.download_url;
  if (row.storage_path && isBunnyConfigured()) {
    try {
      downloadUrl = getCdnUrl(row.storage_path);
    } catch {
      // Fall back to database URL if CDN URL generation fails
    }
  }

  return {
    id: row.id,
    userId: row.user_id,
    fileName: row.file_name,
    fileType: row.file_type as MediaType,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    storagePath: row.storage_path,
    downloadUrl,
    thumbnailUrl: row.thumbnail_url || undefined,
    width: row.width || undefined,
    height: row.height || undefined,
    uploadedAt: row.uploaded_at,
  };
};

export class MediaService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  // Determine media type from mime type
  private getMediaType(mimeType: string): MediaType {
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    return 'image';
  }

  // Generate unique filename
  private generateFileName(originalName: string): string {
    const extension = originalName.split('.').pop() || '';
    const uuid = uuidv4();
    return `${uuid}.${extension}`;
  }

  // Upload a file to Bunny via edge function
  async uploadFile(
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<MediaItem> {
    if (!isBunnyConfigured()) {
      throw new Error('Storage is not configured. Please set VITE_BUNNY_CDN_URL.');
    }

    const fileName = this.generateFileName(file.name);

    // Report initial progress
    if (onProgress) {
      onProgress({
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
      });
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', fileName);

    // Get auth token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    // Upload via edge function with progress tracking using XMLHttpRequest
    const uploadResult = await new Promise<{
      storagePath: string;
      cdnUrl: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
    }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress({
            progress,
            bytesTransferred: event.loaded,
            totalBytes: event.total,
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = JSON.parse(xhr.responseText);
            if (response.success) {
              resolve(response.data);
            } else {
              reject(new Error(response.error || 'Upload failed'));
            }
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const response = JSON.parse(xhr.responseText);
            reject(new Error(response.error || `Upload failed with status ${xhr.status}`));
          } catch {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Network error during upload'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was cancelled'));
      });

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      xhr.open('POST', `${supabaseUrl}/functions/v1/upload-media`);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
      xhr.send(formData);
    });

    // Get image dimensions if it's an image
    let width: number | undefined;
    let height: number | undefined;

    if (file.type.startsWith('image/')) {
      const dimensions = await this.getImageDimensions(file);
      width = dimensions.width;
      height = dimensions.height;
    }

    // Create media item document in database
    const now = new Date().toISOString();
    const mediaData = {
      user_id: this.userId,
      file_name: file.name,
      file_type: this.getMediaType(file.type),
      mime_type: file.type,
      file_size: file.size,
      storage_path: uploadResult.storagePath,
      download_url: uploadResult.cdnUrl,
      width: width || null,
      height: height || null,
      uploaded_at: now,
    };

    const { data, error: insertError } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .insert(mediaData)
      .select()
      .single();

    if (insertError) {
      // Try to clean up uploaded file if database insert fails
      try {
        await this.deleteStorageFile(uploadResult.storagePath);
      } catch (cleanupError) {
        console.error('Failed to cleanup file after db error:', cleanupError);
      }
      throw new Error(`Failed to save media: ${insertError.message}`);
    }

    return dbRowToMediaItem(data);
  }

  // Get image dimensions
  private getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => {
        resolve({ width: 0, height: 0 });
        URL.revokeObjectURL(img.src);
      };
      img.src = URL.createObjectURL(file);
    });
  }

  // Upload multiple files
  async uploadFiles(
    files: File[],
    onProgress?: (fileIndex: number, progress: UploadProgress) => void
  ): Promise<MediaItem[]> {
    const results: MediaItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const mediaItem = await this.uploadFile(files[i], (progress) => {
        if (onProgress) {
          onProgress(i, progress);
        }
      });
      results.push(mediaItem);
    }

    return results;
  }

  // Upload a base64 image (used for reel covers)
  // Returns the storage path so it can be stored in the database
  async uploadBase64Image(base64Data: string, prefix: string = 'cover'): Promise<string> {
    // Extract mime type and data from base64 string
    const matches = base64Data.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid base64 data');
    }

    const mimeType = matches[1];
    const base64Content = matches[2];

    // Convert base64 to Blob
    const byteCharacters = atob(base64Content);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Generate filename
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `${prefix}_${uuidv4()}.${extension}`;

    // Create a File object
    const file = new File([byteArray], fileName, { type: mimeType });

    // Upload using the standard upload method (without saving to media library)
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', fileName);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/upload-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || 'Upload failed');
    }

    // Return the storage path (the CDN URL will be generated when needed)
    return result.data.storagePath;
  }

  // Generate a CDN URL for a storage path (public method for use by other services)
  getPublicUrl(storagePath: string): string {
    return getCdnUrl(storagePath);
  }

  // Get all media items
  async getAllMedia(): Promise<MediaItem[]> {
    const { data, error } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .select('*')
      .eq('user_id', this.userId)
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch media: ${error.message}`);
    }

    return (data || []).map(dbRowToMediaItem);
  }

  // Get recent media items
  async getRecentMedia(count: number = 20): Promise<MediaItem[]> {
    const { data, error } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .select('*')
      .eq('user_id', this.userId)
      .order('uploaded_at', { ascending: false })
      .limit(count);

    if (error) {
      throw new Error(`Failed to fetch media: ${error.message}`);
    }

    return (data || []).map(dbRowToMediaItem);
  }

  // Get media by type
  async getMediaByType(type: MediaType): Promise<MediaItem[]> {
    const { data, error } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .select('*')
      .eq('user_id', this.userId)
      .eq('file_type', type)
      .order('uploaded_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch media: ${error.message}`);
    }

    return (data || []).map(dbRowToMediaItem);
  }

  // Get a single media item by ID
  async getMediaById(mediaId: string): Promise<MediaItem | null> {
    const { data, error } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .select('*')
      .eq('id', mediaId)
      .eq('user_id', this.userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw new Error(`Failed to fetch media: ${error.message}`);
    }

    if (!data) return null;

    return dbRowToMediaItem(data);
  }

  // Delete a file from Bunny storage via edge function
  private async deleteStorageFile(storagePath: string): Promise<void> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${supabaseUrl}/functions/v1/delete-media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storagePath }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Delete failed: ${response.status}`);
    }
  }

  // Delete a media item
  async deleteMedia(mediaId: string): Promise<void> {
    // Get the media item to find storage path
    const mediaItem = await this.getMediaById(mediaId);
    if (!mediaItem) {
      throw new Error('Media item not found');
    }

    // Delete from Storage
    try {
      await this.deleteStorageFile(mediaItem.storagePath);
    } catch (storageError) {
      console.error('Failed to delete from storage:', storageError);
      // Continue with database deletion even if storage delete fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from(TABLES.MEDIA_LIBRARY)
      .delete()
      .eq('id', mediaId)
      .eq('user_id', this.userId);

    if (dbError) {
      throw new Error(`Failed to delete media: ${dbError.message}`);
    }
  }

  // Get media statistics
  async getMediaStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    imageCount: number;
    videoCount: number;
  }> {
    const allMedia = await this.getAllMedia();

    return {
      totalFiles: allMedia.length,
      totalSize: allMedia.reduce((sum, item) => sum + item.fileSize, 0),
      imageCount: allMedia.filter((item) => item.fileType === 'image').length,
      videoCount: allMedia.filter((item) => item.fileType === 'video').length,
    };
  }

  // Validate file before upload
  validateFile(file: File): { valid: boolean; error?: string } {
    const maxSize = 500 * 1024 * 1024; // 500MB (Bunny supports larger files)
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 500MB limit' };
    }

    if (!allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
      };
    }

    return { valid: true };
  }
}

export default MediaService;
