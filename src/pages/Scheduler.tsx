import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Skeleton,
  Chip,
  CircularProgress,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth, addMonths, addDays, format } from 'date-fns';
import toast from 'react-hot-toast';
import { SlotInfo } from 'react-big-calendar';
import { useAuth } from '../hooks/useAuth';
import { useInstagram } from '../hooks/useInstagram';
import { usePosts } from '../hooks/usePosts';
import { useInstagramMedia } from '../hooks/useInstagramMedia';
import { useViewPreference } from '../hooks/useViewPreference';
import { useGridReorder } from '../hooks/useGridReorder';
import CalendarView from '../components/calendar/CalendarView';
import PostCard from '../components/posts/PostCard';
import PostComposer from '../components/posts/PostComposer';
import PostDetailsModal from '../components/posts/PostDetailsModal';
import ViewToggle, { ViewType } from '../components/scheduler/ViewToggle';
import InstagramGridView from '../components/grid/InstagramGridView';
import GridFilters from '../components/grid/GridFilters';
import { ScheduledPost, PostStatus } from '../types';
import { filterPostsForGrid } from '../utils/gridHelpers';

const Scheduler: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { accounts } = useInstagram();

  // View preference (persisted to localStorage)
  const { view: viewMode, setView: setViewMode } = useViewPreference();

  // Grid reorder hook
  const { isReordering, reorderPost } = useGridReorder(user?.uid || '');

  // State
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<PostStatus | 'all'>('all');
  const [dateRange, setDateRange] = useState({
    start: startOfMonth(new Date()),
    end: endOfMonth(addMonths(new Date(), 1)),
  });
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerInitialDate, setComposerInitialDate] = useState<Date | null>(null);
  const [editingPost, setEditingPost] = useState<ScheduledPost | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    postId: string | null;
  }>({ open: false, postId: null });

  // Grid-specific filters
  const [gridDateRange, setGridDateRange] = useState<string>('30');
  const [gridView, setGridView] = useState<'all' | 'reels'>('all');
  const [showCarousels, setShowCarousels] = useState(true);

  // Post details modal
  const [detailsModalPost, setDetailsModalPost] = useState<ScheduledPost | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Instagram media hook - fetches existing posts from Instagram
  const {
    instagramPosts,
    loading: instagramMediaLoading,
    error: instagramMediaError,
    refreshMedia,
    lastFetched,
  } = useInstagramMedia(selectedAccount);

  // Check if compose param is in URL
  useEffect(() => {
    if (searchParams.get('compose') === 'true') {
      setComposerOpen(true);
      searchParams.delete('compose');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Fetch posts with filters
  const {
    posts: scheduledPosts,
    calendarEvents,
    loading,
    deletePost,
    refreshPosts,
  } = usePosts({
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    accountId: selectedAccount === 'all' ? undefined : selectedAccount,
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  // Combine scheduled posts with Instagram posts (published)
  // Instagram posts are prefixed with 'ig_' to distinguish them
  const posts = useMemo(() => {
    // Create a set of Instagram post IDs that we already have as scheduled (published)
    const publishedInstagramIds = new Set(
      scheduledPosts
        .filter(p => p.instagramPostId)
        .map(p => p.instagramPostId)
    );

    // Filter out Instagram posts that already exist in our scheduled posts
    const uniqueInstagramPosts = instagramPosts.filter(
      p => !publishedInstagramIds.has(p.instagramPostId)
    );

    // Combine and sort by date (newest first)
    const combined = [...scheduledPosts, ...uniqueInstagramPosts];

    return combined.sort((a, b) => {
      const timeA = a.scheduledTime instanceof Date
        ? a.scheduledTime
        : (a.scheduledTime as any)?.toDate?.() || new Date();
      const timeB = b.scheduledTime instanceof Date
        ? b.scheduledTime
        : (b.scheduledTime as any)?.toDate?.() || new Date();

      // Sort all posts by date descending (newest/latest first)
      return timeB.getTime() - timeA.getTime();
    });
  }, [scheduledPosts, instagramPosts]);

  // Combined loading state
  const isLoading = loading || instagramMediaLoading;

  // Calculate filtered posts count for grid view
  const filteredGridPosts = useMemo(() => {
    return filterPostsForGrid(posts, {
      showFeed: gridView === 'all',
      showReels: true,
      showCarousels: gridView === 'all' ? showCarousels : false,
      accountId: selectedAccount,
    });
  }, [posts, gridView, showCarousels, selectedAccount]);

  // Handle date range change from calendar
  const handleDateRangeChange = useCallback((start: Date, end: Date) => {
    setDateRange({ start, end });
  }, []);

  // Handle slot click (to create new post at that time)
  const handleSlotClick = useCallback((slotInfo: SlotInfo) => {
    setComposerInitialDate(slotInfo.start);
    setComposerOpen(true);
  }, []);

  // Handle post click - opens details modal
  const handlePostClick = useCallback((post: ScheduledPost) => {
    setDetailsModalPost(post);
    setDetailsModalOpen(true);
  }, []);

  // Handle edit from details modal
  const handleEditPost = useCallback((post: ScheduledPost) => {
    // Prevent editing Instagram posts fetched from API
    if (post.id.startsWith('ig_')) {
      toast.error('Cannot edit posts published on Instagram');
      return;
    }
    setDetailsModalOpen(false);
    setEditingPost(post);
    setComposerOpen(true);
  }, []);

  // Handle duplicate post
  const handleDuplicatePost = useCallback((post: ScheduledPost) => {
    setDetailsModalOpen(false);
    // Open composer with post data but schedule for tomorrow
    const tomorrow = addDays(new Date(), 1);
    const scheduledTime = post.scheduledTime instanceof Date
      ? post.scheduledTime
      : (post.scheduledTime as any)?.toDate?.() || new Date();
    tomorrow.setHours(scheduledTime.getHours(), scheduledTime.getMinutes());

    setEditingPost({
      ...post,
      id: '', // Clear ID to create new post
      scheduledTime: tomorrow,
      status: 'draft',
    });
    setComposerOpen(true);
  }, []);

  // Handle delete confirmation
  const handleDeleteClick = useCallback((postId: string) => {
    // Prevent deleting Instagram posts fetched from API
    if (postId.startsWith('ig_')) {
      toast.error('Cannot delete posts published on Instagram');
      return;
    }
    setDeleteDialog({ open: true, postId });
  }, []);

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, postId: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.postId) return;

    try {
      await deletePost(deleteDialog.postId);
      toast.success('Post deleted');
      // Close details modal if open
      if (detailsModalOpen && detailsModalPost?.id === deleteDialog.postId) {
        setDetailsModalOpen(false);
        setDetailsModalPost(null);
      }
    } catch (err) {
      toast.error('Failed to delete post');
    } finally {
      handleDeleteCancel();
    }
  };

  // Handle post reorder in grid view
  const handlePostReorder = useCallback(
    async (postId: string, sourceIndex: number, destinationIndex: number) => {
      // Only allow reordering of scheduled posts (not Instagram posts)
      if (postId.startsWith('ig_')) {
        toast.error('Cannot reorder published Instagram posts');
        return;
      }
      try {
        await reorderPost(scheduledPosts, postId, sourceIndex, destinationIndex);
        toast.success('Post reordered');
        refreshPosts();
      } catch (err) {
        toast.error('Failed to reorder post');
      }
    },
    [scheduledPosts, reorderPost, refreshPosts]
  );

  // Refresh all data (scheduled posts and Instagram media)
  const handleRefreshAll = useCallback(() => {
    refreshPosts();
    refreshMedia();
    toast.success('Refreshing posts...');
  }, [refreshPosts, refreshMedia]);

  // Get account username for a post
  const getAccountUsername = (accountId: string): string | undefined => {
    return accounts.find((a) => a.id === accountId)?.username;
  };

  // Handle composer close
  const handleComposerClose = () => {
    setComposerOpen(false);
    setComposerInitialDate(null);
    setEditingPost(null);
  };

  // Handle composer success
  const handleComposerSuccess = () => {
    handleComposerClose();
    refreshPosts();
  };

  // Status options for filter
  const statusOptions: { value: PostStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'scheduled', label: 'Scheduled' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Draft' },
    { value: 'failed', label: 'Failed' },
  ];

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight={700} gutterBottom>
            Content Scheduler
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Typography variant="body1" color="text.secondary">
              Schedule and manage your Instagram posts
            </Typography>
            {instagramMediaLoading ? (
              <Chip
                icon={<CircularProgress size={14} />}
                label="Syncing..."
                size="small"
                variant="outlined"
              />
            ) : lastFetched ? (
              <Chip
                icon={<SyncIcon sx={{ fontSize: 14 }} />}
                label={`Synced ${format(lastFetched, 'h:mm a')}`}
                size="small"
                variant="outlined"
                color="success"
              />
            ) : null}
            {instagramMediaError && (
              <Chip
                label="Sync error"
                size="small"
                color="error"
                variant="outlined"
              />
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <ViewToggle
            view={viewMode}
            onChange={setViewMode}
            disabled={isLoading || isReordering}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefreshAll}
            disabled={isLoading}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setComposerOpen(true)}
            sx={{
              background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
              '&:hover': {
                background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
              },
            }}
          >
            Create Post
          </Button>
        </Box>
      </Box>

      {/* Filters - Different for each view */}
      {viewMode === 'grid' ? (
        <GridFilters
          selectedAccount={selectedAccount}
          accounts={accounts}
          onAccountChange={setSelectedAccount}
          gridView={gridView}
          onGridViewChange={setGridView}
          showCarousels={showCarousels}
          onShowCarouselsChange={setShowCarousels}
          dateRange={gridDateRange}
          onDateRangeChange={setGridDateRange}
          totalPosts={posts.length}
          filteredCount={filteredGridPosts.length}
        />
      ) : (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Account</InputLabel>
                <Select
                  value={selectedAccount}
                  label="Account"
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  <MenuItem value="all">All Accounts</MenuItem>
                  {accounts.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      @{account.username}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 150 }}>
                <InputLabel>Status</InputLabel>
                <Select
                  value={selectedStatus}
                  label="Status"
                  onChange={(e) => setSelectedStatus(e.target.value as PostStatus | 'all')}
                >
                  {statusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Paper>
      )}

      {/* Content */}
      {viewMode === 'calendar' ? (
        <CalendarView
          events={calendarEvents}
          loading={isLoading}
          onDateRangeChange={handleDateRangeChange}
          onEventClick={handlePostClick}
          onSlotClick={handleSlotClick}
        />
      ) : viewMode === 'grid' ? (
        <InstagramGridView
          posts={posts}
          loading={isLoading || isReordering}
          showCarousels={showCarousels}
          gridView={gridView}
          selectedAccountId={selectedAccount}
          onPostClick={handlePostClick}
          onPostReorder={handlePostReorder}
          onPostEdit={handleEditPost}
          onPostDelete={handleDeleteClick}
          onCreatePost={() => setComposerOpen(true)}
        />
      ) : (
        // List view fallback
        <Paper sx={{ p: 3 }}>
          {isLoading ? (
            <Grid container spacing={2}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <Skeleton variant="rectangular" height={280} sx={{ borderRadius: 2 }} />
                </Grid>
              ))}
            </Grid>
          ) : posts.length === 0 ? (
            <Box
              sx={{
                textAlign: 'center',
                py: 8,
                backgroundColor: 'grey.50',
                borderRadius: 2,
              }}
            >
              <CalendarIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                No posts found
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                {selectedStatus !== 'all' || selectedAccount !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Start by creating your first post'}
              </Typography>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setComposerOpen(true)}
              >
                Create Post
              </Button>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {posts.map((post) => (
                <Grid key={post.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                  <PostCard
                    post={post}
                    accountUsername={getAccountUsername(post.accountId)}
                    onClick={handlePostClick}
                    onDelete={handleDeleteClick}
                  />
                </Grid>
              ))}
            </Grid>
          )}
        </Paper>
      )}

      {/* Post Details Modal */}
      <PostDetailsModal
        post={detailsModalPost}
        open={detailsModalOpen}
        onClose={() => {
          setDetailsModalOpen(false);
          setDetailsModalPost(null);
        }}
        onEdit={handleEditPost}
        onDelete={handleDeleteClick}
        onDuplicate={handleDuplicatePost}
        accountUsername={
          detailsModalPost ? getAccountUsername(detailsModalPost.accountId) : undefined
        }
      />

      {/* Post Composer */}
      <PostComposer
        open={composerOpen}
        onClose={handleComposerClose}
        onSuccess={handleComposerSuccess}
        initialData={
          editingPost
            ? {
                caption: editingPost.caption,
                firstComment: editingPost.firstComment,
                scheduledTime: editingPost.scheduledTime instanceof Date
                  ? editingPost.scheduledTime
                  : (editingPost.scheduledTime as any)?.toDate?.() || new Date(),
                accountId: editingPost.accountId,
                postType: editingPost.postType,
              }
            : composerInitialDate
            ? { scheduledTime: composerInitialDate }
            : undefined
        }
        editPostId={editingPost?.id || undefined}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={handleDeleteCancel}>
        <DialogTitle>Delete Post?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this post? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel}>Cancel</Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Scheduler;
