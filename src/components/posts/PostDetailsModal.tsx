import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  Chip,
  Divider,
  Avatar,
  Grid,
} from '@mui/material';
import {
  Close as CloseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ContentCopy as DuplicateIcon,
  Schedule as ScheduleIcon,
  CheckCircle as PublishedIcon,
  Error as FailedIcon,
  OpenInNew as OpenIcon,
  Collections as CarouselIcon,
  Movie as ReelIcon,
  Image as ImageIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ScheduledPost, PostStatus, PostType } from '../../types';
import { getStatusBorderColor, getScheduledDate } from '../../utils/gridHelpers';

interface PostDetailsModalProps {
  post: ScheduledPost | null;
  open: boolean;
  onClose: () => void;
  onEdit?: (post: ScheduledPost) => void;
  onDelete?: (postId: string) => void;
  onDuplicate?: (post: ScheduledPost) => void;
  accountUsername?: string;
}

const PostDetailsModal: React.FC<PostDetailsModalProps> = ({
  post,
  open,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  accountUsername,
}) => {
  if (!post) return null;

  const statusColor = getStatusBorderColor(post.status);
  const scheduledDate = getScheduledDate(post);
  const isPublished = post.status === 'published';
  const isInstagramPost = post.id.startsWith('ig_'); // Posts fetched from Instagram API
  const mediaCount = post.media?.length || 0;

  const getStatusIcon = (status: PostStatus) => {
    switch (status) {
      case 'published':
        return <PublishedIcon />;
      case 'failed':
        return <FailedIcon />;
      default:
        return <ScheduleIcon />;
    }
  };

  const getPostTypeIcon = (type: PostType) => {
    switch (type) {
      case 'carousel':
        return <CarouselIcon />;
      case 'reel':
        return <ReelIcon />;
      default:
        return <ImageIcon />;
    }
  };

  const getStatusLabel = (status: PostStatus): string => {
    const labels: Record<PostStatus, string> = {
      scheduled: 'Scheduled',
      published: 'Published',
      failed: 'Failed',
      draft: 'Draft',
      publishing: 'Publishing...',
    };
    return labels[status] || status;
  };

  return (
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
          borderBottom: '1px solid',
          borderColor: 'divider',
          pb: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Post Details
          </Typography>
          <Chip
            icon={getStatusIcon(post.status)}
            label={getStatusLabel(post.status)}
            size="small"
            sx={{
              bgcolor: statusColor,
              color: 'white',
              '& .MuiChip-icon': { color: 'white' },
            }}
          />
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        <Grid container spacing={3}>
          {/* Media Preview */}
          <Grid size={{ xs: 12, md: 6 }}>
            <Box
              sx={{
                position: 'relative',
                paddingTop: '100%',
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                bgcolor: 'grey.100',
              }}
            >
              {post.media?.[0]?.url ? (
                post.media[0].type === 'video' ? (
                  <Box
                    component="video"
                    src={post.media[0].url}
                    controls
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <Box
                    component="img"
                    src={post.media[0].url}
                    alt="Post media"
                    sx={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                )
              ) : (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ImageIcon sx={{ fontSize: 64, color: 'grey.400' }} />
                </Box>
              )}

              {/* Media count badge */}
              {mediaCount > 1 && (
                <Chip
                  icon={<CarouselIcon sx={{ fontSize: 14 }} />}
                  label={mediaCount}
                  size="small"
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    bgcolor: 'rgba(0,0,0,0.7)',
                    color: 'white',
                    '& .MuiChip-icon': { color: 'white' },
                  }}
                />
              )}
            </Box>

            {/* Thumbnail strip for carousels */}
            {mediaCount > 1 && (
              <Box
                sx={{
                  display: 'flex',
                  gap: 1,
                  mt: 1,
                  overflowX: 'auto',
                  pb: 1,
                }}
              >
                {post.media?.map((media, index) => (
                  <Box
                    key={media.id}
                    sx={{
                      width: 60,
                      height: 60,
                      borderRadius: 1,
                      overflow: 'hidden',
                      flexShrink: 0,
                      border: index === 0 ? '2px solid' : '1px solid',
                      borderColor: index === 0 ? 'primary.main' : 'divider',
                    }}
                  >
                    {media.type === 'video' ? (
                      <Box
                        component="video"
                        src={media.url}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <Box
                        component="img"
                        src={media.url}
                        alt={`Media ${index + 1}`}
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Grid>

          {/* Post Details */}
          <Grid size={{ xs: 12, md: 6 }}>
            {/* Account Info */}
            {accountUsername && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Avatar sx={{ width: 32, height: 32 }}>
                  {accountUsername[0].toUpperCase()}
                </Avatar>
                <Typography fontWeight={600}>@{accountUsername}</Typography>
              </Box>
            )}

            {/* Post Type */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
              {getPostTypeIcon(post.postType)}
              <Typography variant="body2" color="text.secondary" sx={{ textTransform: 'capitalize' }}>
                {post.postType} Post
              </Typography>
            </Box>

            {/* Reel Cover Preview */}
            {post.postType === 'reel' && post.reelCover?.url && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  Cover Image
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Box
                    component="img"
                    src={post.reelCover.url}
                    alt="Reel cover"
                    sx={{
                      width: 60,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 1,
                      border: '2px solid',
                      borderColor: 'primary.main',
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {post.reelCover.type === 'frame' ? 'Video Frame' : 'Custom Image'}
                  </Typography>
                </Box>
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Caption */}
            <Typography variant="subtitle2" gutterBottom color="text.secondary">
              Caption
            </Typography>
            <Typography
              variant="body1"
              sx={{
                mb: 2,
                p: 2,
                bgcolor: 'grey.50',
                borderRadius: 1,
                whiteSpace: 'pre-wrap',
                maxHeight: 150,
                overflow: 'auto',
              }}
            >
              {post.caption || 'No caption'}
            </Typography>

            {/* First Comment */}
            {post.firstComment && (
              <>
                <Typography variant="subtitle2" gutterBottom color="text.secondary">
                  First Comment (Hashtags)
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    mb: 2,
                    p: 2,
                    bgcolor: 'grey.50',
                    borderRadius: 1,
                    color: 'primary.main',
                  }}
                >
                  {post.firstComment}
                </Typography>
              </>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Schedule Information */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <ScheduleIcon fontSize="small" color="action" />
              <Typography variant="subtitle2" color="text.secondary">
                {isPublished ? 'Published on' : 'Scheduled for'}
              </Typography>
            </Box>
            <Typography variant="body1" fontWeight={500}>
              {format(scheduledDate, 'EEEE, MMMM d, yyyy')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {format(scheduledDate, 'h:mm a')}
            </Typography>

            {/* Error Message */}
            {post.status === 'failed' && post.errorMessage && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" color="error" gutterBottom>
                  Error
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    p: 2,
                    bgcolor: 'error.light',
                    color: 'error.contrastText',
                    borderRadius: 1,
                  }}
                >
                  {post.errorMessage}
                </Typography>
              </Box>
            )}
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Box sx={{ display: 'flex', gap: 1, width: '100%', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {onDelete && !isInstagramPost && !isPublished && (
              <Button
                color="error"
                startIcon={<DeleteIcon />}
                onClick={() => onDelete(post.id)}
              >
                Delete
              </Button>
            )}
          </Box>

          <Box sx={{ display: 'flex', gap: 1 }}>
            {onDuplicate && !isInstagramPost && (
              <Button
                variant="outlined"
                startIcon={<DuplicateIcon />}
                onClick={() => onDuplicate(post)}
              >
                Duplicate
              </Button>
            )}

            {onEdit && !isPublished && !isInstagramPost && (
              <Button
                variant="contained"
                startIcon={<EditIcon />}
                onClick={() => onEdit(post)}
              >
                Edit Post
              </Button>
            )}

            {isPublished && (post.instagramPostId || post.permalink) && (
              <Button
                variant="contained"
                startIcon={<OpenIcon />}
                onClick={() => {
                  // Use permalink if available, construct URL for others
                  const url = post.permalink ||
                    `https://www.instagram.com/p/${post.instagramPostId}/`;
                  window.open(url, '_blank');
                }}
              >
                View on Instagram
              </Button>
            )}
          </Box>
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PostDetailsModal;
