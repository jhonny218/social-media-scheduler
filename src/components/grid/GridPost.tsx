import React, { useState } from 'react';
import {
  Box,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Collections as CarouselIcon,
  VideoLibrary as ReelIcon,
  Image as ImageIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';
import { DraggableProvidedDragHandleProps } from '@hello-pangea/dnd';
import { ScheduledPost } from '../../types';

interface GridPostProps {
  post: ScheduledPost;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isDragging: boolean;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  paddingTop?: string;
}

const GridPost: React.FC<GridPostProps> = ({
  post,
  onClick,
  onEdit,
  onDelete,
  isDragging,
  dragHandleProps,
  paddingTop = '100%',
}) => {
  const [isHovered, setIsHovered] = useState(false);

  const thumbnailUrl = post.media?.[0]?.thumbnailUrl || post.media?.[0]?.url;
  const isCarousel = post.postType === 'carousel' || (post.media?.length || 0) > 1;
  const isReel = post.postType === 'reel';
  const isInstagramPost = post.id.startsWith('ig_'); // Posts fetched from Instagram API

  const getPostTypeIcon = () => {
    if (isCarousel) return <CarouselIcon sx={{ fontSize: 20 }} />;
    if (isReel) return <ReelIcon sx={{ fontSize: 20 }} />;
    return null;
  };

  return (
    <Box
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        position: 'relative',
        paddingTop,
        cursor: 'pointer',
        opacity: isDragging ? 0.9 : 1,
        overflow: 'hidden',
        transform: isDragging ? 'scale(1.05)' : 'scale(1)',
        transition: 'transform 0.15s ease-out, opacity 0.15s ease-out',
        boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.25)' : 'none',
      }}
      onClick={onClick}
    >
      {/* Background Image/Placeholder */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'grey.200',
        }}
      >
        {thumbnailUrl ? (
          <Box
            component="img"
            src={thumbnailUrl}
            alt={post.caption || 'Post thumbnail'}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'grey.300',
            }}
          >
            <ImageIcon sx={{ fontSize: 48, color: 'grey.500' }} />
          </Box>
        )}
      </Box>

      {/* Post Type Indicator (top right) - Instagram style */}
      {(isCarousel || isReel) && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))',
          }}
        >
          {getPostTypeIcon()}
        </Box>
      )}

      {/* Drag Handle (top left, visible on hover) */}
      {isHovered && !isDragging && dragHandleProps && post.status !== 'published' && (
        <Box
          {...dragHandleProps}
          sx={{
            position: 'absolute',
            top: 6,
            left: 6,
            color: 'white',
            bgcolor: 'rgba(0, 0, 0, 0.5)',
            borderRadius: '4px',
            p: 0.25,
            display: 'flex',
            cursor: 'grab',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
            '&:active': {
              cursor: 'grabbing',
            },
          }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <DragIcon sx={{ fontSize: 16 }} />
        </Box>
      )}

      {/* Hover Overlay - subtle like Instagram */}
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          bgcolor: 'rgba(0, 0, 0, 0.3)',
          color: 'white',
          opacity: isHovered && !isDragging ? 1 : 0,
          transition: 'opacity 0.15s ease-in-out',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Quick Actions - centered */}
        {(onEdit || onDelete) && !isInstagramPost && post.status !== 'published' && (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
            }}
          >
            {onEdit && (
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  sx={{
                    color: 'white',
                    bgcolor: 'rgba(0,0,0,0.5)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <EditIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
            {onDelete && (
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  sx={{
                    color: 'white',
                    bgcolor: 'rgba(0,0,0,0.5)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <DeleteIcon sx={{ fontSize: 18 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )}
      </Box>

    </Box>
  );
};

export default GridPost;
