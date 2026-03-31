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
  Collapse,
} from '@mui/material';
import {
  Pinterest as PinterestIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  CheckCircle as ConnectedIcon,
  Error as ErrorIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Dashboard as BoardIcon,
} from '@mui/icons-material';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { usePinterest } from '../../hooks/usePinterest';
import { PinterestAccount } from '../../types';

const PinAccountConnect: React.FC = () => {
  const {
    accounts,
    boards,
    loading,
    error,
    getAuthUrl,
    disconnectAccount,
    refreshToken,
    connectAccount,
    getBoardsForAccount,
  } = usePinterest();

  const [disconnectDialog, setDisconnectDialog] = useState<{
    open: boolean;
    account: PinterestAccount | null;
  }>({ open: false, account: null });
  const [disconnecting, setDisconnecting] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  // Initiate Pinterest OAuth flow
  const handleConnect = () => {
    const authUrl = getAuthUrl();
    window.location.href = authUrl;
  };

  // Complete OAuth flow if an authorization code was stored by the callback
  useEffect(() => {
    const code = sessionStorage.getItem('pinterest_auth_code');
    if (!code) return;

    // Remove the code immediately to prevent retries
    sessionStorage.removeItem('pinterest_auth_code');

    (async () => {
      try {
        await connectAccount(code);
        toast.success('Pinterest account connected');
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
        toast.error('Failed to connect Pinterest account');
      }
    })();
  }, [connectAccount]);

  // Open disconnect confirmation dialog
  const handleDisconnectClick = (account: PinterestAccount) => {
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

  // Refresh token for an account
  const handleRefreshToken = async (account: PinterestAccount) => {
    setRefreshingToken(account.id);
    try {
      await refreshToken(account.id);
      toast.success(`Token refreshed for @${account.username}`);
    } catch {
      toast.error('Failed to refresh token');
    } finally {
      setRefreshingToken(null);
    }
  };

  // Toggle expanded account to show boards
  const toggleExpanded = (accountId: string) => {
    setExpandedAccount(expandedAccount === accountId ? null : accountId);
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

  // Format token expiry date
  const formatExpiry = (timestamp: string): string => {
    try {
      return format(new Date(timestamp), 'MMM d, yyyy');
    } catch {
      return 'Unknown';
    }
  };

  // Check token expiry status
  const getTokenStatus = (timestamp: string): 'ok' | 'expiring' | 'expired' => {
    try {
      const daysUntilExpiry = (new Date(timestamp).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry < 0) return 'expired';
      if (daysUntilExpiry < 7) return 'expiring';
      return 'ok';
    } catch {
      return 'ok';
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
              Pinterest Accounts
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Connect your Pinterest account to create and schedule pins
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleConnect}
            sx={{
              backgroundColor: '#E60023',
              '&:hover': {
                backgroundColor: '#C41E3A',
              },
            }}
          >
            Connect Pinterest
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
            <PinterestIcon
              sx={{ fontSize: 64, color: 'grey.400', mb: 2 }}
            />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              No Accounts Connected
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Connect your Pinterest account to start creating and scheduling pins to your boards.
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleConnect}
              sx={{
                backgroundColor: '#E60023',
                '&:hover': {
                  backgroundColor: '#C41E3A',
                },
              }}
            >
              Connect Pinterest
            </Button>
          </Box>
        ) : (
          <List>
            {accounts.map((account) => {
              const accountBoards = getBoardsForAccount(account.id);
              const isExpanded = expandedAccount === account.id;
              const tokenStatus = getTokenStatus(account.tokenExpiresAt);

              return (
                <Box key={account.id}>
                  <ListItem
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      mb: 1,
                    }}
                  >
                    <ListItemAvatar>
                      <Avatar
                        src={account.profilePictureUrl || undefined}
                        sx={{
                          backgroundColor: '#E60023',
                        }}
                      >
                        <PinterestIcon />
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
                        <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                          <Typography variant="body2" color="text.secondary" component="span">
                            {formatCount(account.followersCount)} followers
                          </Typography>
                          <Typography variant="body2" color="text.secondary" component="span">
                            {accountBoards.length} boards
                          </Typography>
                          <Typography
                            variant="body2"
                            color={tokenStatus === 'expired' ? 'error.main' : tokenStatus === 'expiring' ? 'warning.main' : 'text.secondary'}
                            component="span"
                          >
                            {tokenStatus === 'expired'
                              ? `Token expired: ${formatExpiry(account.tokenExpiresAt)}`
                              : `Token expires: ${formatExpiry(account.tokenExpiresAt)}`}
                            {tokenStatus === 'expiring' && ' (Expiring soon!)'}
                          </Typography>
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <IconButton
                        onClick={() => handleRefreshToken(account)}
                        disabled={refreshingToken === account.id}
                        title="Refresh token"
                        sx={{ mr: 0.5 }}
                      >
                        {refreshingToken === account.id ? (
                          <CircularProgress size={20} />
                        ) : (
                          <RefreshIcon />
                        )}
                      </IconButton>
                      <IconButton
                        onClick={() => toggleExpanded(account.id)}
                        sx={{ mr: 0.5 }}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                      <IconButton
                        edge="end"
                        onClick={() => handleDisconnectClick(account)}
                        color="error"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>

                  {/* Expanded boards list */}
                  <Collapse in={isExpanded}>
                    <Box
                      sx={{
                        ml: 7,
                        mr: 2,
                        mb: 2,
                        p: 2,
                        backgroundColor: 'grey.50',
                        borderRadius: 2,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BoardIcon fontSize="small" />
                        Boards
                      </Typography>
                      {accountBoards.length === 0 ? (
                        <Typography variant="body2" color="text.secondary">
                          No boards found
                        </Typography>
                      ) : (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          {accountBoards.map((board) => (
                            <Chip
                              key={board.id}
                              label={board.boardName}
                              size="small"
                              variant="outlined"
                              sx={{
                                '& .MuiChip-label': {
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                },
                              }}
                            />
                          ))}
                        </Box>
                      )}
                    </Box>
                  </Collapse>
                </Box>
              );
            })}
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
            To connect Pinterest:
          </Typography>
          <Box component="ul" sx={{ pl: 2, m: 0, mt: 1, color: 'text.secondary' }}>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              You must have a Pinterest Business or Creator account
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              You need to create a Pinterest App in the Developer Console
            </Typography>
            <Typography component="li" variant="body2">
              You must grant permission to create pins on your boards
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
              Image pins (single image)
            </Typography>
            <Typography component="li" variant="body2" sx={{ mb: 0.5 }}>
              Video pins
            </Typography>
            <Typography component="li" variant="body2">
              Pins with destination links
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={disconnectDialog.open} onClose={handleDisconnectCancel}>
        <DialogTitle>Disconnect Account?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to disconnect{' '}
            <strong>@{disconnectDialog.account?.username}</strong>? You will no
            longer be able to schedule pins to this account until you reconnect
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

export default PinAccountConnect;
