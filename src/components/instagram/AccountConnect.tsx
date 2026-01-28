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
  TextField,
  Divider,
} from '@mui/material';
import {
  Instagram as InstagramIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Key as KeyIcon,
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useInstagram } from '../../hooks/useInstagram';
import { InstagramAccount } from '../../types';

const AccountConnect: React.FC = () => {
  const {
    accounts,
    loading,
    error,
    getAuthUrl,
    disconnectAccount,
    connectAccount,
    connectWithToken
  } = useInstagram();

  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    account: InstagramAccount | null;
  }>({ open: false, account: null });
  const [disconnecting, setDisconnecting] = useState(false);

  // Manual token connection dialog state
  const [tokenDialog, setTokenDialog] = useState(false);
  const [instagramUserId, setInstagramUserId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Initiate Instagram OAuth flow
  const handleConnect = () => {
    const authUrl = getAuthUrl();
    window.location.href = authUrl;
  };

  // Open manual token dialog
  const handleOpenTokenDialog = () => {
    setTokenDialog(true);
    setInstagramUserId('');
    setAccessToken('');
    setConnectionError(null);
  };

  // Close manual token dialog
  const handleCloseTokenDialog = () => {
    setTokenDialog(false);
    setInstagramUserId('');
    setAccessToken('');
    setConnectionError(null);
  };

  // Connect with manual token
  const handleConnectWithToken = async () => {
    if (!instagramUserId.trim() || !accessToken.trim()) {
      setConnectionError('Please enter both Instagram User ID and Access Token');
      return;
    }

    setConnecting(true);
    setConnectionError(null);

    try {
      await connectWithToken(instagramUserId.trim(), accessToken.trim());
      toast.success('Instagram account connected successfully!');
      handleCloseTokenDialog();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect account';
      setConnectionError(message);
    } finally {
      setConnecting(false);
    }
  };

  // Complete OAuth flow if an authorization code was stored by the callback
  useEffect(() => {
    const code = sessionStorage.getItem('instagram_auth_code');
    if (!code) return;

    (async () => {
      try {
        await connectAccount(code);
        toast.success('Instagram account connected');
        sessionStorage.removeItem('instagram_auth_code');
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('connected');
          url.searchParams.delete('error');
          window.history.replaceState({}, document.title, url.toString());
        } catch {}
      } catch {
        toast.error('Failed to connect Instagram account');
      }
    })();
  }, [connectAccount]);

  // Open disconnect confirmation dialog
  const handleDisconnectClick = (account: InstagramAccount) => {
    setDisconnectDialog({ open: true, account });
  };

  // Close disconnect dialog
  const handleDisconnectCancel = () => {
    setDisconnectDialog({ open: false, account: null });
  };

  // Confirm disconnect
  const handleDisconnectConfirm = async () => {
    if (!disconnectDialog.account) return;

    setDisconnecting(true);
    try {
      await disconnectAccount(disconnectDialog.account.id);
      toast.success(`@${disconnectDialog.account.username} disconnected`);
      handleDisconnectCancel();
    } catch {
      toast.error('Failed to disconnect account');
    } finally {
      setDisconnecting(false);
    }
  };

  // Format token expiry date
  const formatExpiry = (timestamp: any): string => {
    try {
      const date = timestamp?.toDate?.() || new Date(timestamp);
      return format(date, 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  // Check if token is expired or expiring soon
  const isTokenExpiringSoon = (timestamp: any): boolean => {
    try {
      const date = timestamp?.toDate?.() || new Date(timestamp);
      const daysUntilExpiry = (date.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return daysUntilExpiry < 7;
    } catch {
      return false;
    }
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
              Instagram Accounts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect your Instagram business or creator accounts
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<KeyIcon />}
              onClick={handleOpenTokenDialog}
            >
              Connect with Token
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleConnect}
              sx={{
                background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                '&:hover': {
                  background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
                },
              }}
            >
              Connect via OAuth
            </Button>
          </Box>
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
        ) : accounts.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 6,
              px: 2,
              backgroundColor: 'grey.50',
              borderRadius: 2,
            }}
          >
            <InstagramIcon
              sx={{ fontSize: 64, color: 'grey.400', mb: 2 }}
            />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Accounts Connected
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Connect your Instagram Business or Creator account to start scheduling posts.
              You can use OAuth or connect directly with an access token.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              <Button
                variant="outlined"
                startIcon={<KeyIcon />}
                onClick={handleOpenTokenDialog}
              >
                Connect with Token
              </Button>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleConnect}
              >
                Connect via OAuth
              </Button>
            </Box>
          </Box>
        ) : (
          <List>
            {accounts.map((account) => {
              const expiringSoon = isTokenExpiringSoon(account.tokenExpiresAt);

              return (
                <ListItem
                  key={account.id}
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
                      src={account.profilePictureUrl || undefined}
                      sx={{
                        background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
                      }}
                    >
                      <InstagramIcon />
                    </Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography fontWeight={600}>@{account.username}</Typography>
                        <Chip
                          label={account.accountType}
                          size="small"
                          variant="outlined"
                          sx={{ textTransform: 'capitalize' }}
                        />
                        {account.isConnected ? (
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
                      <Box sx={{ mt: 0.5 }}>
                        <Typography variant="body2" color="text.secondary" component="span">
                          {account.followersCount?.toLocaleString() || 0} followers
                        </Typography>
                        <Typography
                          variant="body2"
                          color={expiringSoon ? 'warning.main' : 'text.secondary'}
                          component="span"
                          sx={{ ml: 2 }}
                        >
                          Token expires: {formatExpiry(account.tokenExpiresAt)}
                          {expiringSoon && ' (Expiring soon!)'}
                        </Typography>
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    <IconButton
                      edge="end"
                      onClick={() => handleDisconnectClick(account)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              );
            })}
          </List>
        )}
      </Paper>

      {/* Requirements Info */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="subtitle1" fontWeight={600} gutterBottom>
          Connection Methods
        </Typography>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            Option 1: Connect with Token (Recommended for testing)
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, mt: 1, color: 'text.secondary' }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Get your Instagram User ID and Access Token from Facebook Developer Console
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Use the "Generate Token" feature for your test Instagram account
            </Typography>
            <Typography component="li" variant="body2">
              Paste the credentials directly into the app
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box>
          <Typography variant="body2" fontWeight={600} color="primary.main">
            Option 2: Connect via OAuth (For production)
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, mt: 1, color: 'text.secondary' }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Instagram Business or Creator account required
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Account must be connected to a Facebook Page
            </Typography>
            <Typography component="li" variant="body2">
              Admin access to the Facebook Page required
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Manual Token Connection Dialog */}
      <Dialog
        open={tokenDialog}
        onClose={handleCloseTokenDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Connect with Access Token</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            Enter your Instagram User ID and Access Token from the Facebook Developer Console.
            You can generate these from your app's Instagram API settings.
          </DialogContentText>

          {connectionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {connectionError}
            </Alert>
          )}

          <TextField
            autoFocus
            fullWidth
            label="Instagram User ID"
            placeholder="e.g., 17841408878216970"
            value={instagramUserId}
            onChange={(e) => setInstagramUserId(e.target.value)}
            sx={{ mb: 2 }}
            helperText="Found in your Facebook Developer Console under Instagram API settings"
          />
          <TextField
            fullWidth
            label="Access Token"
            placeholder="Paste your access token here"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            multiline
            rows={3}
            helperText="Generate this from the 'Generate Token' button in your Facebook Developer Console"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseTokenDialog} disabled={connecting}>
            Cancel
          </Button>
          <Button
            onClick={handleConnectWithToken}
            variant="contained"
            disabled={connecting || !instagramUserId.trim() || !accessToken.trim()}
          >
            {connecting ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Connecting...
              </>
            ) : (
              'Connect Account'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialog.open} onClose={handleDisconnectCancel}>
        <DialogTitle>Disconnect Account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to disconnect{' '}
            <strong>@{disconnectDialog.account?.username}</strong>? You will no
            longer be able to schedule posts to this account until you reconnect
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

export default AccountConnect;
