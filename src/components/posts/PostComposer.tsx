import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  IconButton,
  Divider,
  Alert,
  CircularProgress,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  Close as CloseIcon,
  AutoAwesome as AIIcon,
  Tag as HashtagIcon,
  Image as ImageIcon,
  Movie as ReelIcon,
  Collections as CarouselIcon,
  PhotoCamera as StoryIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Pinterest as PinterestIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addMinutes, isBefore } from 'date-fns';
import toast from 'react-hot-toast';
import MediaUploader, { UploadedFile } from './MediaUploader';
import { useAuth } from '../../hooks/useAuth';
import { useInstagram } from '../../hooks/useInstagram';
import { useFacebook } from '../../hooks/useFacebook';
import { usePinterest } from '../../hooks/usePinterest';
import { MediaService } from '../../services/media.service';
import { Platform } from '../../config/supabase';
import { instagramService } from '../../services/instagram.service';
import { PostMedia, FacebookPostType } from '../../types';

const postSchema = z.object({
  platform: z.enum(['instagram', 'facebook', 'pinterest']),
  accountId: z.string().min(1, 'Please select an account'),
  postType: z.enum(['feed', 'story', 'reel', 'carousel', 'pin', 'video']),
  fbPostType: z.enum(['photo', 'video', 'link', 'album', 'reel']).optional(),
  caption: z.string().max(2200, 'Caption cannot exceed 2200 characters').optional(),
  firstComment: z.string().max(2200, 'Comment cannot exceed 2200 characters').optional(),
  scheduledTime: z.date().refine(
    (date) => isBefore(new Date(), date),
    'Scheduled time must be in the future'
  ),
  // Pinterest-specific fields
  pinBoardId: z.string().optional(),
  pinLink: z.string().url().optional().or(z.literal('')),
  pinAltText: z.string().max(500, 'Alt text cannot exceed 500 characters').optional(),
}).superRefine((data, ctx) => {
  if (data.platform === 'pinterest' && data.caption && data.caption.length > 500) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Pinterest descriptions cannot exceed 500 characters',
      path: ['caption'],
    });
  }
});

type PostFormData = z.infer<typeof postSchema>;

interface PostComposerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Partial<PostFormData>;
  initialMedia?: PostMedia[];
  editPostId?: string;
  initialReelCover?: { type: 'frame' | 'custom'; url?: string; storagePath?: string; timestamp?: number } | null;
}

const PostComposer: React.FC<PostComposerProps> = ({
  open,
  onClose,
  onSuccess,
  initialData,
  initialMedia,
  editPostId,
  initialReelCover,
}) => {
  const isEditing = !!editPostId;
  const { user } = useAuth();
  const { accounts: instagramAccounts, loading: instagramLoading } = useInstagram();
  const { pages: facebookPages, loading: facebookLoading } = useFacebook();
  const { accounts: pinterestAccounts, boards: pinterestBoards, loading: pinterestLoading, getBoardsForAccount } = usePinterest();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captionTone, setCaptionTone] = useState<'casual' | 'professional' | 'playful' | 'inspirational'>('casual');
  // Local cover state (base64 for preview, will be uploaded on submit)
  const [reelCover, setReelCover] = useState<{ type: 'frame' | 'custom'; data: string; timestamp?: number; storagePath?: string } | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PostFormData>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      platform: 'instagram',
      accountId: '',
      postType: 'feed',
      fbPostType: undefined,
      caption: '',
      firstComment: '',
      scheduledTime: addMinutes(new Date(), 30),
      pinBoardId: '',
      pinLink: '',
      pinAltText: '',
      ...initialData,
    },
  });

  const platform = watch('platform');
  const postType = watch('postType');
  const caption = watch('caption');
  const accountId = watch('accountId');

  // Derived state for accounts based on platform
  const accounts = platform === 'facebook'
    ? facebookPages
    : platform === 'pinterest'
      ? pinterestAccounts
      : instagramAccounts;
  const accountsLoading = platform === 'facebook'
    ? facebookLoading
    : platform === 'pinterest'
      ? pinterestLoading
      : instagramLoading;

  // Get boards for selected Pinterest account
  const availablePinterestBoards = platform === 'pinterest' && accountId
    ? getBoardsForAccount(accountId)
    : [];

  const buildDefaultValues = (data?: Partial<PostFormData>): PostFormData => {
    const scheduled =
      data?.scheduledTime instanceof Date
        ? data.scheduledTime
        : data?.scheduledTime
          ? new Date(data.scheduledTime)
          : addMinutes(new Date(), 30);

    return {
      platform: (data?.platform as 'instagram' | 'facebook' | 'pinterest') ?? 'instagram',
      accountId: data?.accountId ?? '',
      postType: data?.postType ?? 'feed',
      fbPostType: data?.fbPostType,
      caption: data?.caption ?? '',
      firstComment: data?.firstComment ?? '',
      scheduledTime: scheduled,
      pinBoardId: data?.pinBoardId ?? '',
      pinLink: data?.pinLink ?? '',
      pinAltText: data?.pinAltText ?? '',
    };
  };

  // Reset account selection when platform changes
  useEffect(() => {
    setValue('accountId', '');
    // Reset post type based on platform
    if (platform === 'pinterest') {
      setValue('postType', 'pin');
      setValue('pinBoardId', '');
    } else {
      setValue('postType', 'feed');
    }
  }, [platform, setValue]);

  // Reset board selection when account changes for Pinterest
  useEffect(() => {
    if (platform === 'pinterest') {
      setValue('pinBoardId', '');
    }
  }, [accountId, platform, setValue]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setFiles([]);
      setError(null);
      setReelCover(null);
    }
  }, [open, reset]);

  // Initialize form values when opening/editing
  useEffect(() => {
    if (!open) return;
    reset(buildDefaultValues(initialData));
  }, [open, initialData, reset]);

  // Initialize media when editing
  useEffect(() => {
    if (!open) return;
    if (initialMedia && initialMedia.length > 0) {
      const orderedMedia = [...initialMedia].sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0)
      );
      const seededFiles: UploadedFile[] = orderedMedia.map((media, index) => ({
        id: `edit-${media.id}-${index}`,
        preview: media.thumbnailUrl || media.url,
        type: media.type,
        progress: 100,
        uploaded: true,
        existingMedia: media,
      }));
      setFiles(seededFiles);
      return;
    }
    setFiles([]);
  }, [open, initialMedia]);

  // Initialize reel cover when editing
  useEffect(() => {
    if (!open) return;
    if (initialReelCover?.url) {
      setReelCover({
        type: initialReelCover.type,
        data: initialReelCover.url, // Use CDN URL as preview
        timestamp: initialReelCover.timestamp,
      });
    }
  }, [open, initialReelCover]);

  // Clear reel cover when post type changes away from reel
  useEffect(() => {
    if (postType !== 'reel') {
      setReelCover(null);
    }
  }, [postType]);

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setValue('accountId', accounts[0].id);
    }
  }, [accounts, accountId, setValue, platform]);

  // Determine available post types based on uploaded files
  const getAvailablePostTypes = (fileList: UploadedFile[]) => {
    const imageCount = fileList.filter(f => f.type === 'image').length;
    const videoCount = fileList.filter(f => f.type === 'video').length;
    const totalCount = fileList.length;

    // No files - all types available
    if (totalCount === 0) {
      return { feed: true, story: true, reel: true, carousel: true };
    }

    // Multiple files - only carousel
    if (totalCount > 1) {
      return { feed: false, story: false, reel: false, carousel: true };
    }

    // Single image - feed or story only
    if (imageCount === 1 && videoCount === 0) {
      return { feed: true, story: true, reel: false, carousel: false };
    }

    // Single video - feed, story, or reel
    if (videoCount === 1 && imageCount === 0) {
      return { feed: true, story: true, reel: true, carousel: false };
    }

    return { feed: true, story: true, reel: true, carousel: true };
  };

  const availablePostTypes = getAvailablePostTypes(files);

  // Auto-switch post type when current selection becomes unavailable
  useEffect(() => {
    const available = getAvailablePostTypes(files);
    if (!available[postType as keyof typeof available]) {
      // Find first available type
      if (available.carousel) {
        setValue('postType', 'carousel');
      } else if (available.feed) {
        setValue('postType', 'feed');
      } else if (available.story) {
        setValue('postType', 'story');
      } else if (available.reel) {
        setValue('postType', 'reel');
      }
    }
  }, [files, postType, setValue]);

  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setFiles(newFiles);
  };

  const handleFileRemove = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Extract multiple frames from video for caption generation
  const extractVideoFrames = (videoUrl: string, frameCount: number = 6): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const frames: string[] = [];

      video.crossOrigin = videoUrl.startsWith('blob:') ? '' : 'anonymous';
      video.muted = true;
      video.playsInline = true;

      let currentFrameIndex = 0;
      let duration = 0;

      video.onloadedmetadata = () => {
        duration = video.duration;
        canvas.width = Math.min(video.videoWidth, 720); // Limit size for API
        canvas.height = Math.min(video.videoHeight, 1280);
        // Start extracting first frame
        video.currentTime = 0;
      };

      video.onseeked = () => {
        try {
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
          frames.push(dataUrl);
          currentFrameIndex++;

          if (currentFrameIndex < frameCount) {
            // Move to next frame position (spread evenly across video)
            const nextTime = (duration / frameCount) * currentFrameIndex;
            video.currentTime = Math.min(nextTime, duration - 0.1);
          } else {
            // All frames extracted
            resolve(frames);
          }
        } catch (e) {
          // CORS error - resolve with whatever frames we have
          if (frames.length > 0) {
            resolve(frames);
          } else {
            reject(e);
          }
        }
      };

      video.onerror = () => {
        if (frames.length > 0) {
          resolve(frames);
        } else {
          reject(new Error('Failed to load video'));
        }
      };

      setTimeout(() => {
        if (frames.length > 0) {
          resolve(frames);
        } else {
          reject(new Error('Video loading timeout'));
        }
      }, 15000);

      video.src = videoUrl;
      video.load();
    });
  };

  // Generate AI caption
  const handleGenerateCaption = async () => {
    if (files.length === 0) {
      toast.error('Please upload media first');
      return;
    }

    setAiLoading(true);
    try {
      const imageFile = files.find((f) => f.type === 'image');
      const videoFile = files.find((f) => f.type === 'video');

      // For images, use single image
      if (imageFile) {
        const result = await instagramService.generateCaption({
          imageUrl: imageFile.preview,
          tone: captionTone,
          includeHashtags: false,
        });
        setValue('caption', result.caption);
        toast.success('Caption generated!');
        return;
      }

      // For reels/videos, extract multiple frames
      if (videoFile) {
        toast.loading('Analyzing video content...', { id: 'extract-frames' });
        try {
          const frames = await extractVideoFrames(videoFile.preview, 6);
          toast.dismiss('extract-frames');

          if (frames.length === 0) {
            toast.error('Could not analyze video. Please try again.');
            return;
          }

          toast.loading(`Generating caption from ${frames.length} video frames...`, { id: 'generate-caption' });

          const result = await instagramService.generateCaption({
            imageUrls: frames,
            isVideo: true,
            tone: captionTone,
            includeHashtags: false,
          });

          toast.dismiss('generate-caption');
          setValue('caption', result.caption);
          toast.success('Caption generated!');
        } catch {
          toast.dismiss('extract-frames');
          toast.dismiss('generate-caption');
          toast.error('Could not analyze video content');
        }
        return;
      }

      toast.error('Please upload an image or video');
    } catch {
      toast.error('Failed to generate caption');
    } finally {
      setAiLoading(false);
    }
  };

  // Generate hashtag suggestions
  const handleGenerateHashtags = async () => {
    if (!caption) {
      toast.error('Please write a caption first');
      return;
    }

    setHashtagLoading(true);
    try {
      const result = await instagramService.suggestHashtags({ caption });
      const hashtagString = result.hashtags.join(' ');
      setValue('firstComment', hashtagString);
      toast.success('Hashtags generated!');
    } catch {
      toast.error('Failed to generate hashtags');
    } finally {
      setHashtagLoading(false);
    }
  };

  const onSubmit = async (data: PostFormData) => {
    if (!user?.uid) return;

    // Validate files
    if (files.length === 0) {
      setError('Please upload at least one media file');
      return;
    }

    if (data.postType === 'carousel' && files.length < 2) {
      setError('Carousel posts require at least 2 media files');
      return;
    }

    if (data.postType === 'reel' && !files.some((f) => f.type === 'video')) {
      setError('Reel posts require a video file');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Upload files to Supabase Storage (skip media library items - already uploaded)
      const mediaService = new MediaService(user.uid);
      const uploadedMedia: PostMedia[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // If existing media (from editing), keep as-is
        if (file.existingMedia) {
          uploadedMedia.push({
            ...file.existingMedia,
            order: i,
          });
          continue;
        }

        // If from media library, use existing media item data
        if (file.isFromLibrary && file.mediaItem) {
          uploadedMedia.push({
            id: file.mediaItem.id,
            url: file.mediaItem.downloadUrl,
            storagePath: file.mediaItem.storagePath, // Store path for URL regeneration
            type: file.mediaItem.fileType,
            order: i,
          });
          continue;
        }

        // Otherwise, upload the new file
        if (!file.file) continue;

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id ? { ...f, progress: 10 } : f
          )
        );

        const mediaItem = await mediaService.uploadFile(file.file, (progress) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === file.id ? { ...f, progress: progress.progress } : f
            )
          );
        });

        uploadedMedia.push({
          id: mediaItem.id,
          url: mediaItem.downloadUrl,
          storagePath: mediaItem.storagePath, // Store path for URL regeneration
          type: mediaItem.fileType,
          order: i,
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id ? { ...f, uploaded: true, progress: 100 } : f
          )
        );
      }

      // Get account details based on platform
      const account = accounts.find((a) => a.id === data.accountId);
      if (!account) {
        throw new Error('Selected account not found');
      }

      // Upload reel cover if present (Instagram only)
      let uploadedReelCover: { type: 'frame' | 'custom'; storagePath: string; timestamp?: number } | undefined;
      if (data.platform === 'instagram' && data.postType === 'reel' && reelCover?.data) {
        // Check if cover is unchanged (data is a URL, not base64)
        const isExistingCover = reelCover.data.startsWith('http') && initialReelCover?.storagePath;

        if (isExistingCover) {
          // Keep existing cover - no need to re-upload
          uploadedReelCover = {
            type: reelCover.type,
            storagePath: initialReelCover.storagePath!,
            timestamp: reelCover.timestamp,
          };
        } else if (reelCover.storagePath) {
          // Cover selected from media library - already on CDN, use its storage path
          uploadedReelCover = {
            type: reelCover.type,
            storagePath: reelCover.storagePath,
            timestamp: reelCover.timestamp,
          };
        } else if (reelCover.data.startsWith('data:')) {
          // New cover selected - upload it
          try {
            toast.loading('Uploading cover image...', { id: 'cover-upload' });
            const coverStoragePath = await mediaService.uploadBase64Image(reelCover.data, 'reel_cover');
            uploadedReelCover = {
              type: reelCover.type,
              storagePath: coverStoragePath,
              timestamp: reelCover.timestamp,
            };
            toast.dismiss('cover-upload');
          } catch (coverError) {
            toast.dismiss('cover-upload');
            console.error('Failed to upload cover:', coverError);
            // Continue without cover - don't block the post
          }
        }
      }

      // Determine Facebook post type based on media
      let fbPostType: FacebookPostType | undefined;
      if (data.platform === 'facebook') {
        if (uploadedMedia.length === 0) {
          fbPostType = 'link';
        } else if (uploadedMedia.length > 1) {
          fbPostType = 'album';
        } else {
          fbPostType = uploadedMedia[0].type === 'video' ? 'video' : 'photo';
        }
      }

      // Create or update the post document
      const { PostsService } = await import('../../services/posts.service');
      const postsService = new PostsService(user.uid);

      // Get platform user ID
      const platformUserId = data.platform === 'facebook'
        ? (account as typeof facebookPages[0]).pageId
        : data.platform === 'pinterest'
          ? (account as typeof pinterestAccounts[0]).pinUserId
          : (account as typeof instagramAccounts[0]).igUserId;

      if (isEditing && editPostId) {
        await postsService.updatePost(editPostId, {
          accountId: data.accountId,
          postType: data.postType,
          fbPostType,
          caption: data.caption,
          media: uploadedMedia,
          scheduledTime: data.scheduledTime,
          firstComment: data.platform === 'instagram' ? data.firstComment : undefined,
          reelCover: uploadedReelCover,
          pinBoardId: data.platform === 'pinterest' ? data.pinBoardId : undefined,
          pinLink: data.platform === 'pinterest' ? data.pinLink : undefined,
          pinAltText: data.platform === 'pinterest' ? data.pinAltText : undefined,
        });
        toast.success('Post updated successfully!');
      } else {
        await postsService.createPost(
          {
            platform: data.platform as Platform,
            accountId: data.accountId,
            postType: data.postType,
            fbPostType,
            caption: data.caption,
            media: uploadedMedia,
            scheduledTime: data.scheduledTime,
            publishMethod: 'auto',
            firstComment: data.platform === 'instagram' ? data.firstComment : undefined,
            reelCover: uploadedReelCover,
            pinBoardId: data.platform === 'pinterest' ? data.pinBoardId : undefined,
            pinLink: data.platform === 'pinterest' ? data.pinLink : undefined,
            pinAltText: data.platform === 'pinterest' ? data.pinAltText : undefined,
          },
          platformUserId
        );
        toast.success('Post scheduled successfully!');
      }
      onSuccess();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to schedule post';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Post type icons handled inline where needed.

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        slotProps={{
          paper: { sx: { borderRadius: 2 } },
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pb: 1,
          }}
        >
          <Typography variant="h6" fontWeight={600}>
            {isEditing ? 'Edit Post' : 'Create New Post'}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Divider />

        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent sx={{ pt: 3 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Platform Selection */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Platform
              </Typography>
              <Controller
                name="platform"
                control={control}
                render={({ field }) => (
                  <ToggleButtonGroup
                    {...field}
                    exclusive
                    onChange={(_, value) => value && field.onChange(value)}
                  >
                    <ToggleButton
                      value="instagram"
                      sx={{
                        px: 3,
                        '&.Mui-selected': {
                          background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                          color: 'white',
                          '&:hover': {
                            background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
                          },
                        },
                      }}
                    >
                      <InstagramIcon sx={{ mr: 1 }} />
                      Instagram
                    </ToggleButton>
                    <ToggleButton
                      value="facebook"
                      sx={{
                        px: 3,
                        '&.Mui-selected': {
                          backgroundColor: '#1877F2',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: '#166FE5',
                          },
                        },
                      }}
                    >
                      <FacebookIcon sx={{ mr: 1 }} />
                      Facebook
                    </ToggleButton>
                    <ToggleButton
                      value="pinterest"
                      sx={{
                        px: 3,
                        '&.Mui-selected': {
                          backgroundColor: '#E60023',
                          color: 'white',
                          '&:hover': {
                            backgroundColor: '#C41E3A',
                          },
                        },
                      }}
                    >
                      <PinterestIcon sx={{ mr: 1 }} />
                      Pinterest
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              />
            </Box>

            {/* Account Selection */}
            <Controller
              name="accountId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth sx={{ mb: 3 }} error={!!errors.accountId}>
                  <InputLabel>
                    {platform === 'facebook' ? 'Facebook Page' : platform === 'pinterest' ? 'Pinterest Account' : 'Instagram Account'}
                  </InputLabel>
                  <Select {...field} label={platform === 'facebook' ? 'Facebook Page' : platform === 'pinterest' ? 'Pinterest Account' : 'Instagram Account'}>
                    {accountsLoading ? (
                      <MenuItem disabled>Loading accounts...</MenuItem>
                    ) : accounts.length === 0 ? (
                      <MenuItem disabled>No accounts connected</MenuItem>
                    ) : platform === 'facebook' ? (
                      facebookPages.map((page) => (
                        <MenuItem key={page.id} value={page.id}>
                          {page.pageName}
                        </MenuItem>
                      ))
                    ) : platform === 'pinterest' ? (
                      pinterestAccounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          @{account.username}
                        </MenuItem>
                      ))
                    ) : (
                      instagramAccounts.map((account) => (
                        <MenuItem key={account.id} value={account.id}>
                          @{account.username}
                        </MenuItem>
                      ))
                    )}
                  </Select>
                  {errors.accountId && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 2 }}>
                      {errors.accountId.message}
                    </Typography>
                  )}
                </FormControl>
              )}
            />

            {/* Pinterest Board Selection */}
            {platform === 'pinterest' && accountId && (
              <Controller
                name="pinBoardId"
                control={control}
                rules={{ required: platform === 'pinterest' ? 'Please select a board' : false }}
                render={({ field }) => (
                  <FormControl fullWidth sx={{ mb: 3 }} error={!!errors.pinBoardId}>
                    <InputLabel>Pinterest Board *</InputLabel>
                    <Select {...field} label="Pinterest Board *">
                      {availablePinterestBoards.length === 0 ? (
                        <MenuItem disabled>No boards available</MenuItem>
                      ) : (
                        availablePinterestBoards.map((board) => (
                          <MenuItem key={board.id} value={board.id}>
                            {board.boardName}
                            {board.privacy !== 'PUBLIC' && (
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                ({board.privacy.toLowerCase()})
                              </Typography>
                            )}
                          </MenuItem>
                        ))
                      )}
                    </Select>
                    {errors.pinBoardId && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 2 }}>
                        {errors.pinBoardId.message}
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            )}

            {/* Post Type */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Post Type
              </Typography>
              <Controller
                name="postType"
                control={control}
                render={({ field }) => (
                  <ToggleButtonGroup
                    {...field}
                    exclusive
                    onChange={(_, value) => value && field.onChange(value)}
                    sx={{ flexWrap: 'wrap', gap: 1 }}
                  >
                    {platform === 'instagram' ? (
                      <>
                        <ToggleButton value="feed" sx={{ px: 3 }} disabled={!availablePostTypes.feed}>
                          <ImageIcon sx={{ mr: 1 }} />
                          Feed
                        </ToggleButton>
                        <ToggleButton value="story" sx={{ px: 3 }} disabled={!availablePostTypes.story}>
                          <StoryIcon sx={{ mr: 1 }} />
                          Story
                        </ToggleButton>
                        <ToggleButton value="reel" sx={{ px: 3 }} disabled={!availablePostTypes.reel}>
                          <ReelIcon sx={{ mr: 1 }} />
                          Reel
                        </ToggleButton>
                        <ToggleButton value="carousel" sx={{ px: 3 }} disabled={!availablePostTypes.carousel}>
                          <CarouselIcon sx={{ mr: 1 }} />
                          Carousel
                        </ToggleButton>
                      </>
                    ) : platform === 'pinterest' ? (
                      <>
                        <ToggleButton value="pin" sx={{ px: 3 }}>
                          <ImageIcon sx={{ mr: 1 }} />
                          Image Pin
                        </ToggleButton>
                        <ToggleButton value="video_pin" sx={{ px: 3 }}>
                          <ReelIcon sx={{ mr: 1 }} />
                          Video Pin
                        </ToggleButton>
                      </>
                    ) : (
                      <>
                        <ToggleButton value="feed" sx={{ px: 3 }}>
                          <ImageIcon sx={{ mr: 1 }} />
                          Photo
                        </ToggleButton>
                        <ToggleButton value="video" sx={{ px: 3 }}>
                          <ReelIcon sx={{ mr: 1 }} />
                          Video
                        </ToggleButton>
                        <ToggleButton value="carousel" sx={{ px: 3 }}>
                          <CarouselIcon sx={{ mr: 1 }} />
                          Album
                        </ToggleButton>
                      </>
                    )}
                  </ToggleButtonGroup>
                )}
              />
              {platform === 'facebook' && (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Post type is auto-detected based on media. Select the primary content type.
                </Typography>
              )}
            </Box>

            {/* Media Upload */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Media
              </Typography>
              <MediaUploader
                files={files}
                onFilesChange={handleFilesChange}
                onFileRemove={handleFileRemove}
                maxFiles={postType === 'reel' ? 1 : 10}
                acceptVideo={true}
                videoOnly={postType === 'reel'}
                showCoverSelector={postType === 'reel'}
                coverData={reelCover}
                onCoverChange={setReelCover}
              />
              {/* Reel cover preview */}
              {postType === 'reel' && reelCover && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    component="img"
                    src={reelCover.data}
                    sx={{
                      width: 60,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor: 'primary.main',
                    }}
                  />
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Cover Image Selected
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {reelCover.type === 'frame' ? 'Video Frame' : 'Custom Image'}
                    </Typography>
                  </Box>
                </Box>
              )}
            </Box>

            {/* Caption */}
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="subtitle2">Caption</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <Select
                    size="small"
                    value={captionTone}
                    onChange={(e) => setCaptionTone(e.target.value as typeof captionTone)}
                    sx={{ minWidth: 120 }}
                  >
                    <MenuItem value="casual">Casual</MenuItem>
                    <MenuItem value="professional">Professional</MenuItem>
                    <MenuItem value="playful">Playful</MenuItem>
                    <MenuItem value="inspirational">Inspirational</MenuItem>
                  </Select>
                  <Tooltip title="Generate AI Caption">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleGenerateCaption}
                      disabled={aiLoading || files.length === 0}
                      startIcon={aiLoading ? <CircularProgress size={16} /> : <AIIcon />}
                    >
                      Generate
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
              <Controller
                name="caption"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    multiline
                    rows={4}
                    fullWidth
                    placeholder={platform === 'pinterest' ? 'Write a description...' : 'Write a caption...'}
                    error={!!errors.caption}
                    helperText={
                      errors.caption?.message ||
                      (platform === 'pinterest'
                        ? `${field.value?.length || 0}/500 characters`
                        : `${field.value?.length || 0}/2200 characters`)
                    }
                  />
                )}
              />
            </Box>

            {/* First Comment (Hashtags) - Instagram only */}
            {platform === 'instagram' && (
              <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle2">First Comment (Hashtags)</Typography>
                  <Tooltip title="Generate Hashtags">
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleGenerateHashtags}
                      disabled={hashtagLoading || !caption}
                      startIcon={hashtagLoading ? <CircularProgress size={16} /> : <HashtagIcon />}
                    >
                      Generate
                    </Button>
                  </Tooltip>
                </Box>
                <Controller
                  name="firstComment"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      multiline
                      rows={2}
                      fullWidth
                      placeholder="#hashtag1 #hashtag2 #hashtag3"
                      error={!!errors.firstComment}
                      helperText={errors.firstComment?.message}
                    />
                  )}
                />
              </Box>
            )}

            {/* Pinterest Link Field */}
            {platform === 'pinterest' && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <LinkIcon fontSize="small" />
                  Destination Link
                </Typography>
                <Controller
                  name="pinLink"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      placeholder="https://example.com/product"
                      error={!!errors.pinLink}
                      helperText={errors.pinLink?.message || 'URL where users will be directed when they click your pin'}
                    />
                  )}
                />
              </Box>
            )}

            {/* Pinterest Alt Text */}
            {platform === 'pinterest' && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Alt Text (Accessibility)
                </Typography>
                <Controller
                  name="pinAltText"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      multiline
                      rows={2}
                      placeholder="Describe your image for screen readers..."
                      error={!!errors.pinAltText}
                      helperText={
                        errors.pinAltText?.message ||
                        `${field.value?.length || 0}/500 characters - Helps make your pin accessible`
                      }
                    />
                  )}
                />
              </Box>
            )}

            {/* Schedule Time */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Schedule Time
              </Typography>
              <Controller
                name="scheduledTime"
                control={control}
                render={({ field }) => (
                  <DateTimePicker
                    {...field}
                    minDateTime={new Date()}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        error: !!errors.scheduledTime,
                        helperText: errors.scheduledTime?.message,
                      },
                    }}
                  />
                )}
              />
            </Box>
          </DialogContent>

          <Divider />

          <DialogActions sx={{ px: 3, py: 2 }}>
            <Button onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || accounts.length === 0}
              sx={
                platform === 'facebook'
                  ? {
                      backgroundColor: '#1877F2',
                      '&:hover': {
                        backgroundColor: '#166FE5',
                      },
                    }
                  : platform === 'pinterest'
                    ? {
                        backgroundColor: '#E60023',
                        '&:hover': {
                          backgroundColor: '#C41E3A',
                        },
                      }
                    : {
                        background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                        '&:hover': {
                          background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
                        },
                      }
              }
            >
              {isSubmitting ? (
                <>
                  <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                  {isEditing ? 'Updating...' : 'Scheduling...'}
                </>
              ) : (
                isEditing ? 'Update Post' : 'Schedule Post'
              )}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </LocalizationProvider>
  );
};

export default PostComposer;
