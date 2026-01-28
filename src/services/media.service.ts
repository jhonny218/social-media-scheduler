import { v4 as uuidv4 } from 'uuid';
import { supabase, TABLES, STORAGE_BUCKETS } from '../config/supabase';
import { MediaItem, MediaType } from '../types';

export interface UploadProgress {
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
}

export type UploadProgressCallback = (progress: UploadProgress) => void;

// Convert database row to MediaItem type
const dbRowToMediaItem = (row: any): MediaItem => ({
  id: row.id,
  userId: row.user_id,
  fileName: row.file_name,
  fileType: row.file_type as MediaType,
  mimeType: row.mime_type,
  fileSize: row.file_size,
  storagePath: row.storage_path,
  downloadUrl: row.download_url,
  thumbnailUrl: row.thumbnail_url || undefined,
  width: row.width || undefined,
  height: row.height || undefined,
  uploadedAt: row.uploaded_at,
});

export class MediaService {
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private get storagePath(): string {
    return `${this.userId}`;
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

  // Upload a file to Supabase Storage
  async uploadFile(
    file: File,
    onProgress?: UploadProgressCallback
  ): Promise<MediaItem> {
    const fileName = this.generateFileName(file.name);
    const storagePath = `${this.storagePath}/${fileName}`;

    // Supabase doesn't have built-in progress tracking for uploads
    // Simulate progress for UX
    if (onProgress) {
      onProgress({
        progress: 0,
        bytesTransferred: 0,
        totalBytes: file.size,
      });
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKETS.MEDIA)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    if (onProgress) {
      onProgress({
        progress: 100,
        bytesTransferred: file.size,
        totalBytes: file.size,
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.MEDIA)
      .getPublicUrl(storagePath);

    const downloadUrl = urlData.publicUrl;

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
      storage_path: storagePath,
      download_url: downloadUrl,
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
      // Clean up uploaded file if database insert fails
      await supabase.storage.from(STORAGE_BUCKETS.MEDIA).remove([storagePath]);
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

    return data ? dbRowToMediaItem(data) : null;
  }

  // Delete a media item
  async deleteMedia(mediaId: string): Promise<void> {
    // Get the media item to find storage path
    const mediaItem = await this.getMediaById(mediaId);
    if (!mediaItem) {
      throw new Error('Media item not found');
    }

    // Delete from Storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKETS.MEDIA)
      .remove([mediaItem.storagePath]);

    if (storageError) {
      console.error('Failed to delete from storage:', storageError);
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
    const maxSize = 100 * 1024 * 1024; // 100MB
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];

    if (file.size > maxSize) {
      return { valid: false, error: 'File size exceeds 100MB limit' };
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
