import React, { useMemo } from 'react';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from '@hello-pangea/dnd';
import {
  Box,
  Grid,
  Typography,
  Skeleton,
  Button,
} from '@mui/material';
import { Add as AddIcon, GridView as GridIcon } from '@mui/icons-material';
import GridPost from './GridPost';
import { ScheduledPost } from '../../types';
import { sortPostsByScheduledTime, filterPostsForGrid } from '../../utils/gridHelpers';

interface InstagramGridViewProps {
  posts: ScheduledPost[];
  loading?: boolean;
  showCarousels?: boolean;
  gridView?: 'all' | 'reels';
  selectedAccountId?: string;
  onPostClick: (post: ScheduledPost) => void;
  onPostReorder: (
    postId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => void;
  onPostEdit?: (post: ScheduledPost) => void;
  onPostDelete?: (postId: string) => void;
  onCreatePost?: () => void;
}

const InstagramGridView: React.FC<InstagramGridViewProps> = ({
  posts,
  loading = false,
  showCarousels = true,
  gridView = 'all',
  selectedAccountId = 'all',
  onPostClick,
  onPostReorder,
  onPostEdit,
  onPostDelete,
  onCreatePost,
}) => {
  // Note: Draggable snapshot provides dragging state; local state removed.
  const tilePaddingTop = gridView === 'reels' ? '177.78%' : '125%';

  // Filter and sort posts
  const displayPosts = useMemo(() => {
    const filtered = filterPostsForGrid(posts, {
      showFeed: gridView === 'all',
      showReels: true,
      showCarousels: gridView === 'all' ? showCarousels : false,
      accountId: selectedAccountId,
    });
    return sortPostsByScheduledTime(filtered);
  }, [posts, gridView, showCarousels, selectedAccountId]);

  // Handle drag end
  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destinationIndex = result.destination.index;

    if (sourceIndex === destinationIndex) return;

    onPostReorder(result.draggableId, sourceIndex, destinationIndex);
  };

  const handleDragStart = () => {
    // noop - using Draggable snapshot for dragging visuals
  };

  // Loading skeleton
  if (loading) {
    return (
      <Box sx={{ backgroundColor: 'white', maxWidth: 468, margin: '0 auto' }}>
        <Grid container spacing={0}>
          {Array.from({ length: 9 }).map((_, index) => (
            <Grid key={index} size={{ xs: 4 }} sx={{ p: '1px' }}>
              <Skeleton
                variant="rectangular"
                sx={{
                  paddingTop: tilePaddingTop,
                  borderRadius: 0,
                }}
              />
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  }

  // Empty state
  if (displayPosts.length === 0) {
    return (
      <Box
        sx={{
          p: 6,
          textAlign: 'center',
          backgroundColor: 'white',
          maxWidth: 468,
          margin: '0 auto',
        }}
      >
        <GridIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
        <Typography variant="body1" color="text.secondary" gutterBottom>
          No posts yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {posts.length === 0
            ? 'Create your first post to see it here'
            : 'Adjust your filters to see posts'}
        </Typography>
        {onCreatePost && (
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={onCreatePost}
            sx={{
              background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
              '&:hover': {
                background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
              },
            }}
          >
            Create Post
          </Button>
        )}
      </Box>
    );
  }

  return (
    <Box sx={{ backgroundColor: 'white' }}>
      <DragDropContext onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        <Droppable droppableId="instagram-grid" direction="horizontal">
          {(provided) => (
            <Box
              ref={provided.innerRef}
              {...provided.droppableProps}
              sx={{
                maxWidth: 468, // Instagram's actual grid width (3 x 156px posts)
                margin: '0 auto',
              }}
            >
              <Grid
                container
                spacing={0}
                sx={{
                  backgroundColor: 'white',
                  '& > .MuiGrid-item': {
                    padding: '1px', // 1px gap between posts like Instagram
                  },
                }}
              >
                {displayPosts.map((post, index) => (
                  <Grid key={post.id} size={{ xs: 4 }}>
                    <Draggable
                      draggableId={post.id}
                      index={index}
                      isDragDisabled={post.status === 'published'}
                    >
                      {(provided, snapshot) => (
                        <Box
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          sx={{
                            transition: snapshot.isDragging
                              ? 'none'
                              : 'transform 0.15s',
                          }}
                        >
                          <GridPost
                            post={post}
                            onClick={() => onPostClick(post)}
                            onEdit={
                              onPostEdit ? () => onPostEdit(post) : undefined
                            }
                            onDelete={
                              onPostDelete
                                ? () => onPostDelete(post.id)
                                : undefined
                            }
                            isDragging={snapshot.isDragging}
                            dragHandleProps={provided.dragHandleProps}
                            paddingTop={tilePaddingTop}
                          />
                        </Box>
                      )}
                    </Draggable>
                  </Grid>
                ))}
                {provided.placeholder}
              </Grid>
            </Box>
          )}
        </Droppable>
      </DragDropContext>
    </Box>
  );
};

export default InstagramGridView;
