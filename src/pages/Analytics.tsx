import React, { useState, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  Visibility as ImpressionsIcon,
  People as ReachIcon,
  ThumbUp as EngagementIcon,
  Schedule as ScheduledIcon,
  CheckCircle as PublishedIcon,
  Error as FailedIcon,
} from '@mui/icons-material';
import { subDays, startOfDay, endOfDay, format } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { useInstagram } from '../hooks/useInstagram';
import { usePosts } from '../hooks/usePosts';
import { AnalyticsService, AnalyticsSummary } from '../services/analytics.service';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
  loading?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon,
  color,
  subtitle,
  loading,
}) => (
  <Card sx={{ height: '100%' }}>
    <CardContent>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {title}
          </Typography>
          {loading ? (
            <Skeleton width={80} height={40} />
          ) : (
            <Typography variant="h4" fontWeight={700}>
              {typeof value === 'number' ? value.toLocaleString() : value}
            </Typography>
          )}
          {subtitle && (
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          )}
        </Box>
        <Box
          sx={{
            backgroundColor: `${color}20`,
            color: color,
            borderRadius: 2,
            p: 1.5,
            display: 'flex',
          }}
        >
          {icon}
        </Box>
      </Box>
    </CardContent>
  </Card>
);

const Analytics: React.FC = () => {
  const { user } = useAuth();
  const { accounts } = useInstagram();
  const [dateRange, setDateRange] = useState('30');
  const [selectedAccount, setSelectedAccount] = useState('all');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Calculate date range
  const endDate = endOfDay(new Date());
  const startDate = startOfDay(subDays(new Date(), parseInt(dateRange)));

  // Fetch posts for the date range
  const { posts, loading: postsLoading } = usePosts({
    startDate,
    endDate,
    accountId: selectedAccount === 'all' ? undefined : selectedAccount,
  });

  // Load analytics summary
  useEffect(() => {
    const loadAnalytics = async () => {
      if (!user?.uid) return;

      setLoading(true);
      try {
        const analyticsService = new AnalyticsService(user.uid);
        const data = await analyticsService.getAnalyticsSummary(startDate, endDate);
        setSummary(data);
      } catch (error) {
        console.error('Error loading analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, [user?.uid, dateRange, selectedAccount]);

  // Get status counts
  const scheduledCount = posts.filter((p) => p.status === 'scheduled').length;
  const publishedCount = posts.filter((p) => p.status === 'published').length;
  const failedCount = posts.filter((p) => p.status === 'failed').length;

  // Get top posts by (simulated) engagement
  const topPosts = posts
    .filter((p) => p.status === 'published')
    .slice(0, 5);

  // Get account for post
  const getAccount = (accountId: string) => accounts.find((a) => a.id === accountId);

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
            Analytics
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Track your Instagram performance and posting activity
          </Typography>
        </Box>

        {/* Filters */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Time Period</InputLabel>
            <Select
              value={dateRange}
              label="Time Period"
              onChange={(e) => setDateRange(e.target.value)}
            >
              <MenuItem value="7">Last 7 days</MenuItem>
              <MenuItem value="30">Last 30 days</MenuItem>
              <MenuItem value="90">Last 90 days</MenuItem>
            </Select>
          </FormControl>

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
        </Box>
      </Box>

      {/* Stats Overview */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Posts"
            value={summary?.totalPosts || 0}
            icon={<TrendingUpIcon />}
            color="#8b5cf6"
            subtitle={`${format(startDate, 'MMM d')} - ${format(endDate, 'MMM d')}`}
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Published"
            value={publishedCount}
            icon={<PublishedIcon />}
            color="#22c55e"
            loading={postsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Scheduled"
            value={scheduledCount}
            icon={<ScheduledIcon />}
            color="#3b82f6"
            loading={postsLoading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Failed"
            value={failedCount}
            icon={<FailedIcon />}
            color="#ef4444"
            loading={postsLoading}
          />
        </Grid>
      </Grid>

      {/* Engagement Stats (when Instagram API data is available) */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Impressions"
            value={summary?.totalImpressions || 0}
            icon={<ImpressionsIcon />}
            color="#f59e0b"
            subtitle="Views of your content"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Reach"
            value={summary?.totalReach || 0}
            icon={<ReachIcon />}
            color="#06b6d4"
            subtitle="Unique accounts reached"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Total Engagement"
            value={summary?.totalEngagement || 0}
            icon={<EngagementIcon />}
            color="#ec4899"
            subtitle="Likes, comments, saves"
            loading={loading}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard
            title="Engagement Rate"
            value={`${(summary?.averageEngagementRate || 0).toFixed(2)}%`}
            icon={<TrendingUpIcon />}
            color="#10b981"
            subtitle="Engagement / Impressions"
            loading={loading}
          />
        </Grid>
      </Grid>

      <Grid container spacing={3}>
        {/* Recent Posts Table */}
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Recent Posts
            </Typography>

            {postsLoading ? (
              <Box>
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={60} sx={{ mb: 1 }} />
                ))}
              </Box>
            ) : posts.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 6,
                  backgroundColor: 'grey.50',
                  borderRadius: 2,
                }}
              >
                <Typography color="text.secondary">
                  No posts found for this period
                </Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Post</TableCell>
                      <TableCell>Account</TableCell>
                      <TableCell>Type</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {posts.slice(0, 10).map((post) => {
                      const account = getAccount(post.accountId);
                      const timestamp = post.scheduledTime as any;
                      const postDate = timestamp?.toDate ? timestamp.toDate() : new Date();

                      return (
                        <TableRow key={post.id} hover>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                              {post.media?.[0]?.url && (
                                <Box
                                  component="img"
                                  src={post.media[0].url}
                                  alt=""
                                  sx={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 1,
                                    objectFit: 'cover',
                                  }}
                                />
                              )}
                              <Typography
                                variant="body2"
                                sx={{
                                  maxWidth: 200,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {post.caption || 'No caption'}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              @{account?.username || 'Unknown'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={post.postType}
                              size="small"
                              variant="outlined"
                              sx={{ textTransform: 'capitalize' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={post.status}
                              size="small"
                              color={
                                post.status === 'published'
                                  ? 'success'
                                  : post.status === 'failed'
                                  ? 'error'
                                  : post.status === 'scheduled'
                                  ? 'info'
                                  : 'default'
                              }
                              sx={{ textTransform: 'capitalize' }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {format(postDate, 'MMM d, yyyy')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        {/* Account Stats */}
        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Connected Accounts
            </Typography>

            {accounts.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 4,
                  backgroundColor: 'grey.50',
                  borderRadius: 2,
                }}
              >
                <Typography color="text.secondary">
                  No accounts connected
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {accounts.map((account) => {
                  const accountPosts = posts.filter((p) => p.accountId === account.id);
                  const publishedPosts = accountPosts.filter((p) => p.status === 'published');

                  return (
                    <Card key={account.id} variant="outlined">
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                          <Avatar
                            src={account.profilePictureUrl}
                            sx={{
                              background: 'linear-gradient(45deg, #405DE6, #833AB4)',
                            }}
                          >
                            {account.username[0].toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography fontWeight={600}>@{account.username}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {account.accountType}
                            </Typography>
                          </Box>
                        </Box>

                        <Grid container spacing={1}>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">
                              Followers
                            </Typography>
                            <Typography fontWeight={600}>
                              {account.followersCount.toLocaleString()}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">
                              Posts ({dateRange}d)
                            </Typography>
                            <Typography fontWeight={600}>
                              {accountPosts.length}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">
                              Published
                            </Typography>
                            <Typography fontWeight={600} color="success.main">
                              {publishedPosts.length}
                            </Typography>
                          </Grid>
                          <Grid size={6}>
                            <Typography variant="caption" color="text.secondary">
                              Scheduled
                            </Typography>
                            <Typography fontWeight={600} color="info.main">
                              {accountPosts.filter((p) => p.status === 'scheduled').length}
                            </Typography>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Analytics;
