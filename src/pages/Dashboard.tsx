import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  Card,
  CardContent,
  Skeleton,
  Chip,
  Avatar,
} from '@mui/material';
import {
  Schedule as ScheduleIcon,
  CheckCircle as PublishedIcon,
  Error as FailedIcon,
  TrendingUp as TrendingIcon,
  Instagram as InstagramIcon,
  Add as AddIcon,
  CalendarMonth as CalendarIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { useInstagram } from '../hooks/useInstagram';
import { usePosts } from '../hooks/usePosts';
import PostCard from '../components/posts/PostCard';
import PostComposer from '../components/posts/PostComposer';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color, loading }) => (
  <Paper
    sx={{
      p: 3,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
      <Box
        sx={{
          backgroundColor: `${color}20`,
          color: color,
          borderRadius: 2,
          p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </Box>
    </Box>
    {loading ? (
      <Skeleton width="60%" height={40} />
    ) : (
      <Typography variant="h4" fontWeight={700}>
        {value}
      </Typography>
    )}
  </Paper>
);

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { accounts, loading: accountsLoading } = useInstagram();
  const [composerOpen, setComposerOpen] = useState(false);

  // Get current week range for posts
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = endOfWeek(now);

  const { posts, loading: postsLoading } = usePosts({
    startDate: weekStart,
    endDate: weekEnd,
  });

  // Calculate stats
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const failedCount = posts.filter((p) => p.status === 'failed').length;

  // Get upcoming posts (next 5 scheduled)
  const upcomingPosts = posts
    .filter((p) => p.status === 'scheduled')
    .slice(0, 5);

  // Get account username for a post
  const getAccountUsername = (accountId: string): string | undefined => {
    return accounts.find((a) => a.id === accountId)?.username;
  };

  return (
    <Box>
      {/* Welcome Section */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Welcome back, {user?.displayName?.split(' ')[0]}!
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Here's an overview of your Instagram scheduling activity this week.
        </Typography>
      </Box>

      {/* Stats Grid */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Scheduled Posts"
            value={scheduledCount}
            icon={<ScheduleIcon />}
            color="#3b82f6"
            loading={postsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Published This Week"
            value={publishedCount}
            icon={<PublishedIcon />}
            color="#22c55e"
            loading={postsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Failed Posts"
            value={failedCount}
            icon={<FailedIcon />}
            color="#ef4444"
            loading={postsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Connected Accounts"
            value={accounts.length}
            icon={<InstagramIcon />}
            color="#8b5cf6"
            loading={accountsLoading}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Quick Actions */}
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Quick Actions
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                fullWidth
                onClick={() => setComposerOpen(true)}
                sx={{
                  background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                  '&:hover': {
                    background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
                  },
                }}
              >
                Create New Post
              </Button>
              <Button
                variant="outlined"
                startIcon={<CalendarIcon />}
                fullWidth
                onClick={() => navigate('/scheduler')}
              >
                View Calendar
              </Button>
              <Button
                variant="outlined"
                startIcon={<InstagramIcon />}
                fullWidth
                onClick={() => navigate('/settings')}
              >
                Manage Accounts
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Upcoming Posts */}
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 3,
              }}
            >
              <Typography variant="h6" fontWeight={600}>
                Upcoming Posts
              </Typography>
              <Button size="small" onClick={() => navigate('/scheduler')}>
                View All
              </Button>
            </Box>

            {postsLoading ? (
              <Grid container spacing={2}>
                {[1, 2, 3].map((i) => (
                  <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                    <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
                  </Grid>
                ))}
              </Grid>
            ) : upcomingPosts.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 6,
                  backgroundColor: 'grey.50',
                  borderRadius: 2,
                }}
              >
                <ScheduleIcon sx={{ fontSize: 48, color: 'grey.400', mb: 2 }} />
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  No upcoming posts scheduled
                </Typography>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => setComposerOpen(true)}
                >
                  Schedule Your First Post
                </Button>
              </Box>
            ) : (
              <Grid container spacing={2}>
                {upcomingPosts.map((post) => (
                  <Grid key={post.id} size={{ xs: 12, sm: 6, md: 4 }}>
                    <PostCard
                      post={post}
                      accountUsername={getAccountUsername(post.accountId)}
                      onClick={() => navigate('/scheduler')}
                    />
                  </Grid>
                ))}
              </Grid>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* Connected Accounts Overview */}
      {accounts.length > 0 && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Connected Accounts
          </Typography>
          <Grid container spacing={2}>
            {accounts.map((account) => (
              <Grid key={account.id} size={{ xs: 12, sm: 6, md: 4 }}>
                <Card variant="outlined">
                  <CardContent>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Avatar
                        src={account.profilePictureUrl}
                        sx={{
                          width: 48,
                          height: 48,
                          background: 'linear-gradient(45deg, #405DE6, #833AB4)',
                        }}
                      >
                        <InstagramIcon />
                      </Avatar>
                      <Box sx={{ flexGrow: 1 }}>
                        <Typography fontWeight={600}>@{account.username}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {account.followersCount.toLocaleString()} followers
                        </Typography>
                      </Box>
                      <Chip
                        label={account.accountType}
                        size="small"
                        variant="outlined"
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* Post Composer Dialog */}
      <PostComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onSuccess={() => setComposerOpen(false)}
      />
    </Box>
  );
};

export default Dashboard;
