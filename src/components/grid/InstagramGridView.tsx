import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Skeleton,
  Button,
} from '@mui/material';
import {
  Add as AddIcon,
  GridView as GridIcon,
} from '@mui/icons-material';
import GridPost from './GridPost';
import { ScheduledPost } from '../../types';
import { sortPostsByScheduledTime, filterPostsForGrid } from '../../utils/gridHelpers';

interface InstagramGridViewProps {
  posts: ScheduledPost[];
  loading?: boolean;
  showCarousels?: boolean;
  showReels?: boolean;
  gridView?: 'all' | 'reels';
  selectedAccountId?: string;
  onPostClick: (post: ScheduledPost) => void;
  onPostReorder: (
    posts: ScheduledPost[],
    postId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => void;
  onPostEdit?: (post: ScheduledPost) => void;
  onPostDelete?: (postId: string) => void;
  onCreatePost?: () => void;
}

const GRID_COLUMNS = 3;
const GRID_GAP = 2;

interface DragState {
  isDragging: boolean;
  draggedId: string | null;
  draggedIndex: number;
  currentTargetIndex: number;
  offsetX: number;
  offsetY: number;
}

const InstagramGridView: React.FC<InstagramGridViewProps> = ({
  posts,
  loading = false,
  showCarousels = true,
  showReels = true,
  gridView = 'all',
  selectedAccountId = 'all',
  onPostClick,
  onPostReorder,
  onPostEdit,
  onPostDelete,
  onCreatePost,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    draggedId: null,
    draggedIndex: -1,
    currentTargetIndex: -1,
    offsetX: 0,
    offsetY: 0,
  });
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

  const tilePaddingTop = gridView === 'reels' ? '177.78%' : '125%';
  const tileAspectRatio = gridView === 'reels' ? 9 / 16 : 4 / 5;

  // Track container width
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    // Small delay to ensure proper measurement after render
    const timer = setTimeout(updateWidth, 100);
    window.addEventListener('resize', updateWidth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateWidth);
    };
  }, []);

  // Filter and sort posts
  const displayPosts = useMemo(() => {
    const filtered = filterPostsForGrid(posts, {
      showFeed: gridView === 'all',
      showReels: gridView === 'reels' ? true : showReels,
      showCarousels: gridView === 'all' ? showCarousels : false,
      accountId: selectedAccountId,
    });
    return sortPostsByScheduledTime(filtered);
  }, [posts, gridView, showCarousels, showReels, selectedAccountId]);

  // Get only scheduled post indices for reordering logic
  const scheduledIndices = useMemo(() => {
    return displayPosts
      .map((post, index) => ({ post, index }))
      .filter(({ post }) => post.status === 'scheduled' || post.status === 'draft')
      .map(({ index }) => index);
  }, [displayPosts]);

  // Calculate cell dimensions
  const cellWidth = containerWidth > 0
    ? (containerWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS
    : 0;
  const cellHeight = cellWidth > 0 ? cellWidth / tileAspectRatio : 0;

  // Get grid position from index
  const getPositionFromIndex = useCallback((index: number) => {
    const col = index % GRID_COLUMNS;
    const row = Math.floor(index / GRID_COLUMNS);
    return {
      x: col * (cellWidth + GRID_GAP),
      y: row * (cellHeight + GRID_GAP),
    };
  }, [cellWidth, cellHeight]);

  // Get the closest grid index from a position (center-based, more forgiving)
  const getClosestIndex = useCallback((centerX: number, centerY: number) => {
    if (cellWidth === 0 || cellHeight === 0) return 0;

    // Calculate which cell the center point is in
    const cellWithGap = cellWidth + GRID_GAP;
    const rowWithGap = cellHeight + GRID_GAP;

    const col = Math.floor(centerX / cellWithGap);
    const row = Math.floor(centerY / rowWithGap);

    // Clamp to valid range
    const clampedCol = Math.max(0, Math.min(col, GRID_COLUMNS - 1));
    const clampedRow = Math.max(0, row);

    const index = clampedRow * GRID_COLUMNS + clampedCol;
    return Math.min(index, displayPosts.length - 1);
  }, [cellWidth, cellHeight, displayPosts.length]);

  // Calculate visual positions considering drag state
  const getVisualIndex = useCallback((originalIndex: number): number => {
    if (!dragState.isDragging || dragState.draggedIndex === -1) {
      return originalIndex;
    }

    const post = displayPosts[originalIndex];
    const isScheduled = post.status === 'scheduled' || post.status === 'draft';

    // Published posts never move
    if (!isScheduled) {
      return originalIndex;
    }

    // The dragged item - will be rendered separately
    if (originalIndex === dragState.draggedIndex) {
      return originalIndex;
    }

    // Find positions of scheduled posts only
    const draggedScheduledIndex = scheduledIndices.indexOf(dragState.draggedIndex);
    const currentScheduledIndex = scheduledIndices.indexOf(originalIndex);
    const targetScheduledIndex = scheduledIndices.indexOf(dragState.currentTargetIndex);

    if (draggedScheduledIndex === -1 || currentScheduledIndex === -1) {
      return originalIndex;
    }

    // Calculate new scheduled index based on drag
    let newScheduledIndex = currentScheduledIndex;

    if (targetScheduledIndex !== -1) {
      if (currentScheduledIndex > draggedScheduledIndex && currentScheduledIndex <= targetScheduledIndex) {
        newScheduledIndex = currentScheduledIndex - 1;
      } else if (currentScheduledIndex < draggedScheduledIndex && currentScheduledIndex >= targetScheduledIndex) {
        newScheduledIndex = currentScheduledIndex + 1;
      }
    }

    return scheduledIndices[newScheduledIndex] ?? originalIndex;
  }, [dragState, displayPosts, scheduledIndices]);

  // Handle drag start
  const handleDragStart = useCallback((postId: string, index: number, e: React.MouseEvent | React.TouchEvent) => {
    const post = displayPosts[index];
    if (post.status !== 'scheduled' && post.status !== 'draft') return;

    e.preventDefault();

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const pos = getPositionFromIndex(index);

    // Calculate offset from the click point to the top-left of the cell
    const offsetX = clientX - rect.left - pos.x;
    const offsetY = clientY - rect.top - pos.y;

    setDragState({
      isDragging: true,
      draggedId: postId,
      draggedIndex: index,
      currentTargetIndex: index,
      offsetX,
      offsetY,
    });

    setDragPosition({ x: pos.x, y: pos.y });
  }, [displayPosts, getPositionFromIndex]);

  // Handle drag move
  useEffect(() => {
    if (!dragState.isDragging) return;

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      // Calculate new position
      const x = clientX - rect.left - dragState.offsetX;
      const y = clientY - rect.top - dragState.offsetY;

      setDragPosition({ x, y });

      // Use the center of the dragged item for target detection
      const centerX = x + cellWidth / 2;
      const centerY = y + cellHeight / 2;
      const targetIndex = getClosestIndex(centerX, centerY);

      if (targetIndex !== dragState.currentTargetIndex) {
        setDragState(prev => ({ ...prev, currentTargetIndex: targetIndex }));
      }
    };

    const handleEnd = () => {
      if (dragState.draggedIndex !== dragState.currentTargetIndex && dragState.draggedId) {
        const sourceScheduledIdx = scheduledIndices.indexOf(dragState.draggedIndex);
        const targetScheduledIdx = scheduledIndices.indexOf(dragState.currentTargetIndex);

        if (sourceScheduledIdx !== -1 && targetScheduledIdx !== -1) {
          const scheduledPosts = displayPosts.filter(
            p => p.status === 'scheduled' || p.status === 'draft'
          );
          onPostReorder(
            scheduledPosts,
            dragState.draggedId,
            sourceScheduledIdx,
            targetScheduledIdx
          );
        }
      }

      setDragState({
        isDragging: false,
        draggedId: null,
        draggedIndex: -1,
        currentTargetIndex: -1,
        offsetX: 0,
        offsetY: 0,
      });
    };

    window.addEventListener('mousemove', handleMove, { passive: false });
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState, cellWidth, cellHeight, getClosestIndex, scheduledIndices, displayPosts, onPostReorder]);

  // Loading skeleton
  if (loading) {
    return (
      <Box sx={{ backgroundColor: 'white', maxWidth: 468, margin: '0 auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
            gap: `${GRID_GAP}px`,
          }}
        >
          {Array.from({ length: 9 }).map((_, index) => (
            <Skeleton
              key={index}
              variant="rectangular"
              sx={{ paddingTop: tilePaddingTop, borderRadius: 0 }}
            />
          ))}
        </Box>
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

  const totalRows = Math.ceil(displayPosts.length / GRID_COLUMNS);
  const containerHeight = cellHeight > 0 ? totalRows * cellHeight + (totalRows - 1) * GRID_GAP : 0;
  const useAbsolutePositioning = dragState.isDragging && cellWidth > 0;

  return (
    <Box sx={{ backgroundColor: 'white' }}>
      <Box
        ref={containerRef}
        sx={{
          maxWidth: 468,
          margin: '0 auto',
          position: 'relative',
          ...(useAbsolutePositioning
            ? { height: containerHeight }
            : {
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
                gap: `${GRID_GAP}px`,
              }),
        }}
      >
        {displayPosts.map((post, index) => {
          const isScheduled = post.status === 'scheduled' || post.status === 'draft';
          const isDragged = dragState.isDragging && dragState.draggedId === post.id;

          if (isDragged) {
            // Render placeholder at the target position
            const targetPos = getPositionFromIndex(dragState.currentTargetIndex);
            return (
              <Box
                key={post.id}
                sx={{
                  position: 'absolute',
                  left: targetPos.x,
                  top: targetPos.y,
                  width: cellWidth,
                  height: cellHeight,
                  bgcolor: 'rgba(99, 102, 241, 0.1)',
                  borderRadius: 1,
                  border: '2px dashed',
                  borderColor: 'primary.main',
                  transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
                }}
              />
            );
          }

          const visualIndex = getVisualIndex(index);
          const position = useAbsolutePositioning ? getPositionFromIndex(visualIndex) : null;

          return (
            <Box
              key={post.id}
              sx={{
                ...(useAbsolutePositioning
                  ? {
                      position: 'absolute',
                      left: position!.x,
                      top: position!.y,
                      width: cellWidth,
                      height: cellHeight,
                      transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
                    }
                  : {}),
                zIndex: 1,
              }}
            >
              <GridPost
                post={post}
                onClick={() => !dragState.isDragging && onPostClick(post)}
                onEdit={onPostEdit && isScheduled ? () => onPostEdit(post) : undefined}
                onDelete={onPostDelete && isScheduled ? () => onPostDelete(post.id) : undefined}
                isDragging={false}
                dragHandleProps={
                  isScheduled
                    ? {
                        onMouseDown: (e: React.MouseEvent) => handleDragStart(post.id, index, e),
                        onTouchStart: (e: React.TouchEvent) => handleDragStart(post.id, index, e),
                      }
                    : undefined
                }
                paddingTop={tilePaddingTop}
              />
            </Box>
          );
        })}

        {/* Dragged item overlay */}
        {dragState.isDragging && dragState.draggedId && cellWidth > 0 && (
          <Box
            sx={{
              position: 'absolute',
              left: dragPosition.x,
              top: dragPosition.y,
              width: cellWidth,
              height: cellHeight,
              zIndex: 1000,
              cursor: 'grabbing',
              boxShadow: '0 12px 28px rgba(0,0,0,0.25), 0 4px 8px rgba(0,0,0,0.1)',
              borderRadius: 1,
              overflow: 'hidden',
              pointerEvents: 'none',
              transform: 'scale(1.03)',
              transition: 'box-shadow 0.2s ease, transform 0.1s ease',
            }}
          >
            {(() => {
              const post = displayPosts.find(p => p.id === dragState.draggedId);
              if (!post) return null;
              return (
                <GridPost
                  post={post}
                  onClick={() => {}}
                  isDragging={true}
                  paddingTop={tilePaddingTop}
                />
              );
            })()}
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default InstagramGridView;
