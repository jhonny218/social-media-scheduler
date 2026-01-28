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
  Chip,
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
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { addMinutes, isBefore } from 'date-fns';
import toast from 'react-hot-toast';
import MediaUploader from './MediaUploader';
import { useAuth } from '../../hooks/useAuth';
import { useInstagram } from '../../hooks/useInstagram';
import { MediaService } from '../../services/media.service';
import { PLATFORMS } from '../../config/supabase';
import { instagramService } from '../../services/instagram.service';
import { PostType, PostMedia } from '../../types';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
  progress: number;
  uploaded: boolean;
}

const postSchema = z.object({
  accountId: z.string().min(1, 'Please select an Instagram account'),
  postType: z.enum(['feed', 'story', 'reel', 'carousel']),
  caption: z.string().max(2200, 'Caption cannot exceed 2200 characters').optional(),
  firstComment: z.string().max(2200, 'Comment cannot exceed 2200 characters').optional(),
  scheduledTime: z.date().refine(
    (date) => isBefore(new Date(), date),
    'Scheduled time must be in the future'
  ),
});

type PostFormData = z.infer<typeof postSchema>;

interface PostComposerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: Partial<PostFormData>;
  editPostId?: string;
}

const PostComposer: React.FC<PostComposerProps> = ({
  open,
  onClose,
  onSuccess,
  initialData,
  editPostId,
}) => {
  const isEditing = !!editPostId;
  const { user } = useAuth();
  const { accounts, loading: accountsLoading } = useInstagram();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [hashtagLoading, setHashtagLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captionTone, setCaptionTone] = useState<'casual' | 'professional' | 'playful' | 'inspirational'>('casual');

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
      accountId: '',
      postType: 'feed',
      caption: '',
      firstComment: '',
      scheduledTime: addMinutes(new Date(), 30),
      ...initialData,
    },
  });

  const postType = watch('postType');
  const caption = watch('caption');
  const accountId = watch('accountId');

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      reset();
      setFiles([]);
      setError(null);
    }
  }, [open, reset]);

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setValue('accountId', accounts[0].id);
    }
  }, [accounts, accountId, setValue]);

  const handleFilesChange = (newFiles: UploadedFile[]) => {
    setFiles(newFiles);
  };

  const handleFileRemove = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  // Generate AI caption
  const handleGenerateCaption = async () => {
    if (files.length === 0) {
      toast.error('Please upload an image first');
      return;
    }

    setAiLoading(true);
    try {
      const imageFile = files.find((f) => f.type === 'image');
      if (!imageFile) {
        toast.error('Please upload an image for caption generation');
        return;
      }

      // Convert file to base64 for preview (in real app, upload to storage first)
      const result = await instagramService.generateCaption({
        imageUrl: imageFile.preview,
        tone: captionTone,
        includeHashtags: false,
      });

      setValue('caption', result.caption);
      toast.success('Caption generated!');
    } catch (err) {
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
    } catch (err) {
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
      // Upload files to Supabase Storage
      const mediaService = new MediaService(user.uid);
      const uploadedMedia: PostMedia[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
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
          type: mediaItem.fileType,
          order: i,
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === file.id ? { ...f, uploaded: true, progress: 100 } : f
          )
        );
      }

      // Get Instagram account details
      const account = accounts.find((a) => a.id === data.accountId);
      if (!account) {
        throw new Error('Selected account not found');
      }

      // Create or update the post document
      const { PostsService } = await import('../../services/posts.service');
      const postsService = new PostsService(user.uid);

      if (isEditing && editPostId) {
        await postsService.updatePost(editPostId, {
          accountId: data.accountId,
          postType: data.postType,
          caption: data.caption,
          media: uploadedMedia,
          scheduledTime: data.scheduledTime,
          firstComment: data.firstComment,
        });
        toast.success('Post updated successfully!');
      } else {
        await postsService.createPost(
          {
            platform: PLATFORMS.INSTAGRAM,
            accountId: data.accountId,
            postType: data.postType,
            caption: data.caption,
            media: uploadedMedia,
            scheduledTime: data.scheduledTime,
            publishMethod: 'auto',
            firstComment: data.firstComment,
          },
          account.igUserId
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

  const getPostTypeIcon = (type: PostType) => {
    switch (type) {
      case 'feed':
        return <ImageIcon />;
      case 'story':
        return <StoryIcon />;
      case 'reel':
        return <ReelIcon />;
      case 'carousel':
        return <CarouselIcon />;
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 2 },
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

            {/* Account Selection */}
            <Controller
              name="accountId"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth sx={{ mb: 3 }} error={!!errors.accountId}>
                  <InputLabel>Instagram Account</InputLabel>
                  <Select {...field} label="Instagram Account">
                    {accountsLoading ? (
                      <MenuItem disabled>Loading accounts...</MenuItem>
                    ) : accounts.length === 0 ? (
                      <MenuItem disabled>No accounts connected</MenuItem>
                    ) : (
                      accounts.map((account) => (
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
                    <ToggleButton value="feed" sx={{ px: 3 }}>
                      <ImageIcon sx={{ mr: 1 }} />
                      Feed
                    </ToggleButton>
                    <ToggleButton value="story" sx={{ px: 3 }}>
                      <StoryIcon sx={{ mr: 1 }} />
                      Story
                    </ToggleButton>
                    <ToggleButton value="reel" sx={{ px: 3 }}>
                      <ReelIcon sx={{ mr: 1 }} />
                      Reel
                    </ToggleButton>
                    <ToggleButton value="carousel" sx={{ px: 3 }}>
                      <CarouselIcon sx={{ mr: 1 }} />
                      Carousel
                    </ToggleButton>
                  </ToggleButtonGroup>
                )}
              />
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
                maxFiles={postType === 'carousel' ? 10 : 1}
                acceptVideo={postType === 'reel' || postType === 'story'}
              />
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
                    placeholder="Write a caption..."
                    error={!!errors.caption}
                    helperText={
                      errors.caption?.message ||
                      `${field.value?.length || 0}/2200 characters`
                    }
                  />
                )}
              />
            </Box>

            {/* First Comment (Hashtags) */}
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
              sx={{
                background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
                },
              }}
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
