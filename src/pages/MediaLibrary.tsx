import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  IconButton,
  TextField,
  InputAdornment,
  ToggleButtonGroup,
  ToggleButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Skeleton,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Search as SearchIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  ViewModule as GridIcon,
  ViewList as ListIcon,
  Delete as DeleteIcon,
  MoreVert as MoreIcon,
  Close as CloseIcon,
  Download as DownloadIcon,
  ContentCopy as CopyIcon,
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import { MediaService } from '../services/media.service';
import { MediaItem, MediaType } from '../types';

type ViewMode = 'grid' | 'list';
type FilterType = 'all' | 'image' | 'video';

const MediaLibrary: React.FC = () => {
  const { user } = useAuth();
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(new Map());
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; item: MediaItem | null }>({
    open: false,
    item: null,
  });
  const [menuAnchor, setMenuAnchor] = useState<{ el: HTMLElement | null; item: MediaItem | null }>({
    el: null,
    item: null,
  });

  // Load media
  useEffect(() => {
    const loadMedia = async () => {
      if (!user?.uid) return;

      setLoading(true);
      try {
        const mediaService = new MediaService(user.uid);
        const items = await mediaService.getAllMedia();
        setMedia(items);
      } catch (error) {
        console.error('Error loading media:', error);
        toast.error('Failed to load media library');
      } finally {
        setLoading(false);
      }
    };

    loadMedia();
  }, [user?.uid]);

  // Handle file upload
  const handleUpload = useCallback(
    async (acceptedFiles: File[]) => {
      if (!user?.uid) return;

      setUploading(true);
      const mediaService = new MediaService(user.uid);

      try {
        const uploadedItems: MediaItem[] = [];

        for (const file of acceptedFiles) {
          const fileId = `upload-${Date.now()}-${file.name}`;

          // Validate file
          const validation = mediaService.validateFile(file);
          if (!validation.valid) {
            toast.error(`${file.name}: ${validation.error}`);
            continue;
          }

          // Upload file
          const item = await mediaService.uploadFile(file, (progress) => {
            setUploadProgress((prev) => new Map(prev).set(fileId, progress.progress));
          });

          uploadedItems.push(item);
          setUploadProgress((prev) => {
            const newMap = new Map(prev);
            newMap.delete(fileId);
            return newMap;
          });
        }

        // Add to state
        setMedia((prev) => [...uploadedItems, ...prev]);
        toast.success(`${uploadedItems.length} file(s) uploaded`);
      } catch (error) {
        console.error('Upload error:', error);
        toast.error('Failed to upload files');
      } finally {
        setUploading(false);
      }
    },
    [user?.uid]
  );

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleUpload,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
    },
    maxSize: 100 * 1024 * 1024,
    noClick: true,
  });

  // Handle delete
  const handleDelete = async () => {
    if (!user?.uid || !deleteDialog.item) return;

    try {
      const mediaService = new MediaService(user.uid);
      await mediaService.deleteMedia(deleteDialog.item.id);
      setMedia((prev) => prev.filter((m) => m.id !== deleteDialog.item!.id));
      toast.success('File deleted');
    } catch (error) {
      toast.error('Failed to delete file');
    } finally {
      setDeleteDialog({ open: false, item: null });
    }
  };

  // Handle copy URL
  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('URL copied to clipboard');
    handleMenuClose();
  };

  // Handle download
  const handleDownload = (item: MediaItem) => {
    const link = document.createElement('a');
    link.href = item.downloadUrl;
    link.download = item.fileName;
    link.click();
    handleMenuClose();
  };

  // Menu handlers
  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, item: MediaItem) => {
    event.stopPropagation();
    setMenuAnchor({ el: event.currentTarget, item });
  };

  const handleMenuClose = () => {
    setMenuAnchor({ el: null, item: null });
  };

  // Filter media
  const filteredMedia = media.filter((item) => {
    // Filter by type
    if (filterType !== 'all' && item.fileType !== filterType) {
      return false;
    }

    // Filter by search
    if (searchQuery && !item.fileName.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }

    return true;
  });

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box {...getRootProps()} sx={{ minHeight: '100%' }}>
      <input {...getInputProps()} />

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
            Media Library
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your uploaded images and videos
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<UploadIcon />}
          onClick={open}
          disabled={uploading}
          sx={{
            background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
            '&:hover': {
              background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
            },
          }}
        >
          Upload Files
        </Button>
      </Box>

      {/* Drag overlay */}
      {isDragActive && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            border: '3px dashed',
            borderColor: 'primary.main',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Paper sx={{ p: 4, textAlign: 'center' }}>
            <UploadIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
            <Typography variant="h6">Drop files to upload</Typography>
          </Paper>
        </Box>
      )}

      {/* Filters */}
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
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              size="small"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color="action" />
                  </InputAdornment>
                ),
              }}
              sx={{ minWidth: 250 }}
            />

            <ToggleButtonGroup
              value={filterType}
              exclusive
              onChange={(_, value) => value && setFilterType(value)}
              size="small"
            >
              <ToggleButton value="all">All</ToggleButton>
              <ToggleButton value="image">
                <ImageIcon sx={{ mr: 0.5 }} /> Images
              </ToggleButton>
              <ToggleButton value="video">
                <VideoIcon sx={{ mr: 0.5 }} /> Videos
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {filteredMedia.length} files
            </Typography>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(_, value) => value && setViewMode(value)}
              size="small"
            >
              <ToggleButton value="grid">
                <GridIcon />
              </ToggleButton>
              <ToggleButton value="list">
                <ListIcon />
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Paper>

      {/* Media Grid/List */}
      <Paper sx={{ p: 3 }}>
        {loading ? (
          <Grid container spacing={2}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Grid key={i} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <Skeleton variant="rectangular" sx={{ paddingTop: '100%', borderRadius: 2 }} />
              </Grid>
            ))}
          </Grid>
        ) : filteredMedia.length === 0 ? (
          <Box
            sx={{
              textAlign: 'center',
              py: 8,
              backgroundColor: 'grey.50',
              borderRadius: 2,
            }}
          >
            <ImageIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchQuery || filterType !== 'all'
                ? 'No files match your filters'
                : 'No files uploaded yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Drag and drop files here or click upload
            </Typography>
            <Button variant="outlined" startIcon={<UploadIcon />} onClick={open}>
              Upload Files
            </Button>
          </Box>
        ) : viewMode === 'grid' ? (
          <Grid container spacing={2}>
            {filteredMedia.map((item) => (
              <Grid key={item.id} size={{ xs: 6, sm: 4, md: 3, lg: 2 }}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    '&:hover': { boxShadow: 3 },
                  }}
                  onClick={() => setSelectedMedia(item)}
                >
                  <Box sx={{ position: 'relative', paddingTop: '100%' }}>
                    {item.fileType === 'image' ? (
                      <CardMedia
                        component="img"
                        image={item.downloadUrl}
                        alt={item.fileName}
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          backgroundColor: 'grey.900',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <VideoIcon sx={{ fontSize: 48, color: 'grey.500' }} />
                      </Box>
                    )}
                    <Chip
                      icon={item.fileType === 'image' ? <ImageIcon /> : <VideoIcon />}
                      label={item.fileType}
                      size="small"
                      sx={{
                        position: 'absolute',
                        top: 8,
                        left: 8,
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        color: 'white',
                        '& .MuiChip-icon': { color: 'white' },
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, item)}
                      sx={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                      }}
                    >
                      <MoreIcon fontSize="small" />
                    </IconButton>
                  </Box>
                  <CardContent sx={{ py: 1, px: 1.5 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.fileName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatFileSize(item.fileSize)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Box>
            {filteredMedia.map((item) => (
              <Box
                key={item.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  p: 2,
                  borderBottom: '1px solid',
                  borderColor: 'divider',
                  cursor: 'pointer',
                  '&:hover': { backgroundColor: 'action.hover' },
                }}
                onClick={() => setSelectedMedia(item)}
              >
                <Box
                  sx={{
                    width: 60,
                    height: 60,
                    borderRadius: 1,
                    overflow: 'hidden',
                    flexShrink: 0,
                  }}
                >
                  {item.fileType === 'image' ? (
                    <Box
                      component="img"
                      src={item.downloadUrl}
                      alt={item.fileName}
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
                        backgroundColor: 'grey.900',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <VideoIcon sx={{ color: 'grey.500' }} />
                    </Box>
                  )}
                </Box>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Typography fontWeight={500}>{item.fileName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatFileSize(item.fileSize)} | {item.width}x{item.height}
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {format(item.uploadedAt.toDate(), 'MMM d, yyyy')}
                </Typography>
                <IconButton onClick={(e) => handleMenuOpen(e, item)}>
                  <MoreIcon />
                </IconButton>
              </Box>
            ))}
          </Box>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor.el}
        open={Boolean(menuAnchor.el)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => menuAnchor.item && handleCopyUrl(menuAnchor.item.downloadUrl)}>
          <ListItemIcon>
            <CopyIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Copy URL</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => menuAnchor.item && handleDownload(menuAnchor.item)}>
          <ListItemIcon>
            <DownloadIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        <MenuItem
          onClick={() => {
            setDeleteDialog({ open: true, item: menuAnchor.item });
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Media Preview Dialog */}
      <Dialog
        open={Boolean(selectedMedia)}
        onClose={() => setSelectedMedia(null)}
        maxWidth="lg"
      >
        {selectedMedia && (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography
                sx={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: 400,
                }}
              >
                {selectedMedia.fileName}
              </Typography>
              <IconButton onClick={() => setSelectedMedia(null)} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {selectedMedia.fileType === 'image' ? (
                <Box
                  component="img"
                  src={selectedMedia.downloadUrl}
                  alt={selectedMedia.fileName}
                  sx={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
              ) : (
                <Box
                  component="video"
                  src={selectedMedia.downloadUrl}
                  controls
                  sx={{ maxWidth: '100%', maxHeight: '70vh' }}
                />
              )}
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Size: {formatFileSize(selectedMedia.fileSize)}
                </Typography>
                {selectedMedia.width && selectedMedia.height && (
                  <Typography variant="body2" color="text.secondary">
                    Dimensions: {selectedMedia.width} x {selectedMedia.height}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  Uploaded: {format(selectedMedia.uploadedAt.toDate(), 'MMMM d, yyyy h:mm a')}
                </Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => handleDownload(selectedMedia)} startIcon={<DownloadIcon />}>
                Download
              </Button>
              <Button
                onClick={() => handleCopyUrl(selectedMedia.downloadUrl)}
                startIcon={<CopyIcon />}
              >
                Copy URL
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, item: null })}>
        <DialogTitle>Delete File?</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete "{deleteDialog.item?.fileName}"? This action cannot be
            undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, item: null })}>Cancel</Button>
          <Button onClick={handleDelete} color="error">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MediaLibrary;
