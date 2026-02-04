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
  Avatar,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Add as AddIcon,
  Refresh as RefreshIcon,
  Sync as SyncIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Pinterest as PinterestIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth, addMonths, format } from 'date-fns';
import toast from 'react-hot-toast';
import { SlotInfo } from 'react-big-calendar';
import { useAuth } from '../hooks/useAuth';
import { useInstagram } from '../hooks/useInstagram';
import { useFacebook } from '../hooks/useFacebook';
import { usePinterest } from '../hooks/usePinterest';
import { usePosts } from '../hooks/usePosts';
import { useInstagramMedia } from '../hooks/useInstagramMedia';
import { useViewPreference } from '../hooks/useViewPreference';
import { useGridReorder } from '../hooks/useGridReorder';
import CalendarView from '../components/calendar/CalendarView';
import PostCard from '../components/posts/PostCard';
import PostComposer from '../components/posts/PostComposer';
import PostDetailsModal from '../components/posts/PostDetailsModal';
import ViewToggle from '../components/scheduler/ViewToggle';
import InstagramGridView from '../components/grid/InstagramGridView';
import GridFilters from '../components/grid/GridFilters';
import { ScheduledPost, PostStatus } from '../types';
import { filterPostsForGrid } from '../utils/gridHelpers';

const Scheduler: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const { accounts: instagramAccounts } = useInstagram();
  const { pages: facebookPages } = useFacebook();
  const { accounts: pinterestAccounts } = usePinterest();

  // Combined accounts for filtering
  const accounts = useMemo(() => [
    ...instagramAccounts.map(a => ({
      id: a.id,
      name: `@${a.username}`,
      username: a.username,
      type: 'instagram' as const,
      profilePictureUrl: a.profilePictureUrl,
    })),
    ...facebookPages.map(p => ({
      id: p.id,
      name: p.pageName,
      username: p.pageName,
      type: 'facebook' as const,
      profilePictureUrl: p.profilePictureUrl,
    })),
    ...pinterestAccounts.map(a => ({
      id: a.id,
      name: `@${a.username}`,
      username: a.username,
      type: 'pinterest' as const,
      profilePictureUrl: a.profilePictureUrl,
    })),
  ], [instagramAccounts, facebookPages, pinterestAccounts]);

  // View preference (persisted to localStorage)
  const { view: viewMode, setView: setViewMode } = useViewPreference();

  // Grid reorder hook
  const { isReordering, reorderPost } = useGridReorder(user?.uid || '');

  // State
  // For grid view: specific account required
  // For calendar/list view: 'all' is default
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
  const [gridView, setGridView] = useState<'all' | 'reels'>('all');
  const [showCarousels, setShowCarousels] = useState(true);
  const [showReels, setShowReels] = useState(true);

  // Set first Instagram account as default for grid view when accounts load
  useEffect(() => {
    if (viewMode === 'grid' && accounts.length > 0 && selectedAccount === 'all') {
      setSelectedAccount(accounts[0].id);
    }
  }, [viewMode, accounts, selectedAccount]);

  // Post details modal
  const [detailsModalPost, setDetailsModalPost] = useState<ScheduledPost | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Instagram media hook - fetches existing posts from Instagram
  // Only pass account ID for grid view, and only if an account is selected
  const {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    instagramPosts: _instagramPosts,
    loading: instagramMediaLoading,
    error: instagramMediaError,
    refreshMedia,
    lastFetched,
  } = useInstagramMedia(viewMode === 'grid' && selectedAccount ? selectedAccount : undefined);

  // Check if compose param is in URL
  useEffect(() => {
    if (searchParams.get('compose') === 'true') {
      setComposerOpen(true);
      searchParams.delete('compose');
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Fetch posts with filters - now includes published posts from Instagram
  // For grid view, don't apply date range filter (show all posts)
  // For calendar view, apply date range filter
  const {
    posts,
    calendarEvents,
    loading,
    deletePost,
    refreshPosts,
  } = usePosts({
    status: selectedStatus === 'all' ? undefined : selectedStatus,
    accountId: selectedAccount && selectedAccount !== 'all' ? selectedAccount : undefined,
    startDate: viewMode === 'calendar' ? dateRange.start : undefined,
    endDate: viewMode === 'calendar' ? dateRange.end : undefined,
  });

  // Combined loading state (includes Instagram sync loading)
  const isLoading = loading || instagramMediaLoading;

  // Calculate filtered posts count for grid view
  const filteredGridPosts = useMemo(() => {
    return filterPostsForGrid(posts, {
      showFeed: gridView === 'all',
      showReels: gridView === 'reels' ? true : showReels,
      showCarousels: gridView === 'all' ? showCarousels : false,
      accountId: selectedAccount,
    });
  }, [posts, gridView, showCarousels, showReels, selectedAccount]);

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
    // Prevent editing published posts
    if (post.status === 'published') {
      toast.error('Cannot edit published posts');
      return;
    }
    setDetailsModalOpen(false);
    setEditingPost(post);
    setComposerOpen(true);
  }, []);

  // Handle duplicate post
  const handleDuplicatePost = useCallback((post: ScheduledPost) => {
    setDetailsModalOpen(false);
    // Get the original scheduled time
    const originalTime = post.scheduledTime instanceof Date
      ? post.scheduledTime
      : typeof post.scheduledTime === 'object' && post.scheduledTime && 'toDate' in post.scheduledTime
        ? (post.scheduledTime as { toDate: () => Date }).toDate()
        : new Date();

    // Use original time if it's in the future, otherwise use current time
    const now = new Date();
    const duplicateTime = originalTime > now ? originalTime : now;

    setEditingPost({
      ...post,
      id: '', // Clear ID to create new post
      scheduledTime: duplicateTime,
      status: 'draft',
    });
    setComposerOpen(true);
  }, []);

  // Handle delete confirmation
  const handleDeleteClick = useCallback((postId: string) => {
    // Find the post to check its status
    const post = posts.find(p => p.id === postId);

    // Prevent deleting published posts
    if (post?.status === 'published') {
      toast.error('Cannot delete published posts');
      return;
    }
    setDeleteDialog({ open: true, postId });
  }, [posts]);

  const handleDeleteCancel = () => {
    setDeleteDialog({ open: false, postId: null });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialog.postId) return;

    try {
      await deletePost(deleteDialog.postId);
      refreshPosts();
      toast.success('Post deleted');
      // Close details modal if open
      if (detailsModalOpen && detailsModalPost?.id === deleteDialog.postId) {
        setDetailsModalOpen(false);
        setDetailsModalPost(null);
      }
    } catch {
      toast.error('Failed to delete post');
    } finally {
      handleDeleteCancel();
    }
  };

  // Handle post reorder in grid view
  const handlePostReorder = useCallback(
    async (
      orderedPosts: ScheduledPost[],
      postId: string,
      sourceIndex: number,
      destinationIndex: number
    ) => {
      // Find the post to check its status
      const post = orderedPosts.find(p => p.id === postId);

      // Only allow reordering of scheduled posts (not published posts)
      if (post?.status !== 'scheduled') {
        toast.error('Only scheduled posts can be reordered');
        return;
      }
      try {
        await reorderPost(orderedPosts, postId, sourceIndex, destinationIndex);
        toast.success('Post reordered');
        refreshPosts();
      } catch {
        toast.error('Failed to reorder post');
      }
    },
    [reorderPost, refreshPosts]
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
              Schedule and manage your social media posts
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
          showReels={showReels}
          onShowReelsChange={setShowReels}
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
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel>Account</InputLabel>
                <Select
                  value={selectedAccount}
                  label="Account"
                  onChange={(e) => setSelectedAccount(e.target.value)}
                >
                  <MenuItem value="all">All Accounts</MenuItem>
                  {accounts.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {account.type === 'instagram' ? (
                          <InstagramIcon sx={{ fontSize: 16, color: '#E4405F' }} />
                        ) : account.type === 'pinterest' ? (
                          <PinterestIcon sx={{ fontSize: 16, color: '#E60023' }} />
                        ) : (
                          <FacebookIcon sx={{ fontSize: 16, color: '#1877F2' }} />
                        )}
                        <Avatar
                          src={account.profilePictureUrl}
                          sx={{ width: 20, height: 20, fontSize: 10 }}
                        >
                          {account.username[0].toUpperCase()}
                        </Avatar>
                        {account.name}
                      </Box>
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
          showReels={showReels}
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
                  : typeof editingPost.scheduledTime === 'object' && editingPost.scheduledTime && 'toDate' in editingPost.scheduledTime
                    ? (editingPost.scheduledTime as { toDate: () => Date }).toDate()
                    : new Date(editingPost.scheduledTime as string),
                accountId: editingPost.accountId,
                postType: ['feed', 'story', 'reel', 'carousel'].includes(editingPost.postType)
                  ? (editingPost.postType as 'feed' | 'story' | 'reel' | 'carousel')
                  : undefined,
              }
            : composerInitialDate
            ? { scheduledTime: composerInitialDate }
            : undefined
        }
        initialMedia={editingPost?.media}
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
