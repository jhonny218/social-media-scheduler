import React from 'react';
import {
  Card,
  CardContent,
  CardMedia,
  Box,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Avatar,
  Tooltip,
} from '@mui/material';
import {
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Schedule as ScheduleIcon,
  CheckCircle as PublishedIcon,
  Error as FailedIcon,
  Drafts as DraftIcon,
  Image as ImageIcon,
  Movie as ReelIcon,
  Collections as CarouselIcon,
  PhotoCamera as StoryIcon,
  PlayArrow as PlayIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ScheduledPost, PostStatus, PostType } from '../../types';

interface PostCardProps {
  post: ScheduledPost;
  accountUsername?: string;
  onEdit?: (post: ScheduledPost) => void;
  onDelete?: (postId: string) => void;
  onClick?: (post: ScheduledPost) => void;
}

const PostCard: React.FC<PostCardProps> = ({
  post,
  accountUsername,
  onEdit,
  onDelete,
  onClick,
}) => {
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleEdit = () => {
    handleMenuClose();
    onEdit?.(post);
  };

  const handleDelete = () => {
    handleMenuClose();
    onDelete?.(post.id);
  };

  const getStatusColor = (status: PostStatus): 'success' | 'warning' | 'error' | 'default' | 'info' => {
    switch (status) {
      case 'published':
        return 'success';
      case 'scheduled':
        return 'info';
      case 'publishing':
        return 'warning';
      case 'failed':
        return 'error';
      case 'draft':
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status: PostStatus) => {
    switch (status) {
      case 'published':
        return <PublishedIcon fontSize="small" />;
      case 'scheduled':
        return <ScheduleIcon fontSize="small" />;
      case 'failed':
        return <FailedIcon fontSize="small" />;
      case 'draft':
      default:
        return <DraftIcon fontSize="small" />;
    }
  };

  const getPostTypeIcon = (type: PostType) => {
    switch (type) {
      case 'feed':
        return <ImageIcon fontSize="small" />;
      case 'story':
        return <StoryIcon fontSize="small" />;
      case 'reel':
        return <ReelIcon fontSize="small" />;
      case 'carousel':
        return <CarouselIcon fontSize="small" />;
    }
  };

  const formatScheduledTime = (timestamp: unknown): string => {
    try {
      const maybe = timestamp as { toDate?: () => Date };
      const date = maybe?.toDate ? maybe.toDate() : new Date(String(timestamp));
      return format(date, 'MMM d, yyyy h:mm a');
    } catch {
      return 'Invalid date';
    }
  };

  const mediaUrl = post.media?.[0]?.url || '';
  const isVideo = post.media?.[0]?.type === 'video';
  const mediaCount = post.media?.length || 0;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': onClick
          ? {
              transform: 'translateY(-2px)',
              boxShadow: 3,
            }
          : {},
      }}
      onClick={() => onClick?.(post)}
    >
      {/* Media Preview */}
      <Box sx={{ position: 'relative', paddingTop: '100%' }}>
        {mediaUrl ? (
          isVideo ? (
            <>
              <Box
                component="video"
                src={mediaUrl}
                muted
                preload="metadata"
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  backgroundColor: 'grey.900',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: '50%',
                  p: 1,
                }}
              >
                <PlayIcon sx={{ color: 'white', fontSize: 32 }} />
              </Box>
            </>
          ) : (
            <CardMedia
              component="img"
              image={mediaUrl}
              alt="Post preview"
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
              backgroundColor: 'grey.200',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <ImageIcon sx={{ fontSize: 48, color: 'grey.400' }} />
          </Box>
        )}

        {/* Post Type Badge */}
        <Tooltip title={post.postType}>
          <Chip
            icon={getPostTypeIcon(post.postType)}
            label={post.postType}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              left: 8,
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              textTransform: 'capitalize',
              '& .MuiChip-icon': {
                color: 'white',
              },
            }}
          />
        </Tooltip>

        {/* Media Count Badge (for carousels) */}
        {mediaCount > 1 && (
          <Chip
            icon={<CarouselIcon sx={{ fontSize: 14 }} />}
            label={mediaCount}
            size="small"
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              backgroundColor: 'rgba(0,0,0,0.7)',
              color: 'white',
              '& .MuiChip-icon': {
                color: 'white',
              },
            }}
          />
        )}

        {/* Status Badge */}
        <Chip
          icon={getStatusIcon(post.status)}
          label={post.status}
          size="small"
          color={getStatusColor(post.status)}
          sx={{
            position: 'absolute',
            bottom: 8,
            left: 8,
            textTransform: 'capitalize',
          }}
        />
      </Box>

      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        {/* Account Info */}
        {accountUsername && (
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Avatar sx={{ width: 20, height: 20, fontSize: 12, mr: 0.5 }}>
              {accountUsername[0].toUpperCase()}
            </Avatar>
            <Typography variant="caption" color="text.secondary">
              @{accountUsername}
            </Typography>
          </Box>
        )}

        {/* Caption Preview */}
        <Typography
          variant="body2"
          sx={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            mb: 1,
            minHeight: 40,
          }}
        >
          {post.caption || 'No caption'}
        </Typography>

        {/* Schedule Time */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <ScheduleIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="caption" color="text.secondary">
            {formatScheduledTime(post.scheduledTime)}
          </Typography>
        </Box>
      </CardContent>

      {/* Actions */}
      {(onEdit || onDelete) && (
        <Box sx={{ px: 1, pb: 1 }}>
          <IconButton
            size="small"
            onClick={handleMenuOpen}
            sx={{ ml: 'auto', display: 'block' }}
          >
            <MoreIcon fontSize="small" />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={menuOpen}
            onClose={handleMenuClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
          >
            {onEdit && post.status !== 'published' && (
              <MenuItem onClick={handleEdit}>
                <ListItemIcon>
                  <EditIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText>Edit</ListItemText>
              </MenuItem>
            )}
            {onDelete && (
              <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                <ListItemIcon>
                  <DeleteIcon fontSize="small" color="error" />
                </ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            )}
          </Menu>
        </Box>
      )}
    </Card>
  );
};

export default PostCard;
