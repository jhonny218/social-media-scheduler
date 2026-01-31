import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  ListItemSecondaryAction,
  Avatar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  CircularProgress,
  Alert,
  Skeleton,
  Divider,
} from '@mui/material';
import {
  Facebook as FacebookIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  People as FansIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { useFacebook } from '../../hooks/useFacebook';
import { FacebookPage } from '../../types';

const FBPageConnect: React.FC = () => {
  const {
    pages,
    loading,
    error,
    getAuthUrl,
    disconnectPage,
    connectPages,
  } = useFacebook();

  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    page: FacebookPage | null;
  }>({ open: false, page: null });
  const [disconnecting, setDisconnecting] = useState(false);

  // Initiate Facebook OAuth flow
  const handleConnect = () => {
    const authUrl = getAuthUrl();
    window.location.href = authUrl;
  };

  // Complete OAuth flow if an authorization code was stored by the callback
  useEffect(() => {
    const code = sessionStorage.getItem('facebook_auth_code');
    if (!code) return;

    // Remove the code immediately to prevent retries
    sessionStorage.removeItem('facebook_auth_code');

    (async () => {
      try {
        await connectPages(code);
        toast.success('Facebook pages connected');
        // Clean URL params
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('connected');
          url.searchParams.delete('error');
          window.history.replaceState({}, document.title, url.toString());
        } catch (e) {
          console.warn('Failed to clean URL params', e);
        }
      } catch {
        toast.error('Failed to connect Facebook pages');
      }
    })();
  }, [connectPages]);

  // Open disconnect confirmation dialog
  const handleDisconnectClick = (page: FacebookPage) => {
    setDisconnectDialog({ open: true, page });
  };

  // Close disconnect dialog
  const handleDisconnectCancel = () => {
    setDisconnectDialog({ open: false, page: null });
  };

  // Confirm disconnect
  const handleDisconnectConfirm = async () => {
    if (!disconnectDialog.page) return;

    setDisconnecting(true);
    try {
      await disconnectPage(disconnectDialog.page.id);
      toast.success(`${disconnectDialog.page.pageName} disconnected`);
      handleDisconnectCancel();
    } catch {
      toast.error('Failed to disconnect page');
    } finally {
      setDisconnecting(false);
    }
  };

  // Format number with K/M suffix
  const formatCount = (count: number): string => {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toLocaleString();
  };

  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
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
            <Typography variant="h6" fontWeight={600}>
              Facebook Pages
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect your Facebook Pages to schedule posts
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleConnect}
            sx={{
              backgroundColor: '#1877F2',
              '&:hover': {
                backgroundColor: '#166FE5',
              },
            }}
          >
            Connect Facebook
          </Button>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading ? (
          <List>
            {[1, 2].map((i) => (
              <ListItem key={i}>
                <ListItemAvatar>
                  <Skeleton variant="circular" width={40} height={40} />
                </ListItemAvatar>
                <ListItemText
                  primary={<Skeleton width="60%" />}
                  secondary={<Skeleton width="40%" />}
                />
              </ListItem>
            ))}
          </List>
        ) : pages.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              px: 2,
              backgroundColor: 'grey.50',
              borderRadius: 2,
            }}
          >
            <FacebookIcon
              sx={{ fontSize: 64, color: 'grey.400', mb: 2 }}
            />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Pages Connected
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Connect your Facebook Pages to start scheduling posts.
              You must have admin access to at least one Facebook Page.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleConnect}
              sx={{
                backgroundColor: '#1877F2',
                '&:hover': {
                  backgroundColor: '#166FE5',
                },
              }}
            >
              Connect Facebook
            </Button>
          </Box>
        ) : (
          <List>
            {pages.map((page) => (
              <ListItem
                key={page.id}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  mb: 1,
                  '&:last-child': { mb: 0 },
                }}
              >
                <ListItemAvatar>
                  <Avatar
                    src={page.profilePictureUrl || undefined}
                    sx={{
                      backgroundColor: '#1877F2',
                    }}
                  >
                    <FacebookIcon />
                  </Avatar>
                </ListItemAvatar>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography fontWeight={600}>{page.pageName}</Typography>
                      {page.pageCategory && (
                        <Chip
                          label={page.pageCategory}
                          size="small"
                          variant="outlined"
                        />
                      )}
                      {page.isConnected ? (
                        <Chip
                          icon={<ConnectedIcon sx={{ fontSize: 14 }} />}
                          label="Connected"
                          size="small"
                          color="success"
                          variant="outlined"
                        />
                      ) : (
                        <Chip
                          icon={<ErrorIcon sx={{ fontSize: 14 }} />}
                          label="Disconnected"
                          size="small"
                          color="error"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <FansIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                        <Typography variant="body2" color="text.secondary" component="span">
                          {formatCount(page.fanCount)} fans
                        </Typography>
                      </Box>
                      {page.followersCount > 0 && (
                        <Typography variant="body2" color="text.secondary" component="span">
                          {formatCount(page.followersCount)} followers
                        </Typography>
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    onClick={() => handleDisconnectClick(page)}
                    color="error"
                  >
                    <DeleteIcon />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      {/* Requirements Info */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Requirements
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            To connect Facebook Pages:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, mt: 1, color: 'text.secondary' }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              You must be an admin of the Facebook Page
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              The Facebook Page must be published (not unpublished)
            </Typography>
            <Typography component="li" variant="body2">
              You'll need to grant permission to manage posts
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            Supported post types:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, mt: 1, color: 'text.secondary' }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Photo posts (single image)
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Video posts
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Album posts (multiple photos)
            </Typography>
            <Typography component="li" variant="body2">
              Text/link posts
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialog.open} onClose={handleDisconnectCancel}>
        <DialogTitle>Disconnect Page?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to disconnect{' '}
            <strong>{disconnectDialog.page?.pageName}</strong>? You will no
            longer be able to schedule posts to this page until you reconnect
            it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDisconnectCancel} disabled={disconnecting}>
            Cancel
          </Button>
          <Button
            onClick={handleDisconnectConfirm}
            color="error"
            disabled={disconnecting}
          >
            {disconnecting ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Disconnecting...
              </>
            ) : (
              'Disconnect'
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FBPageConnect;
