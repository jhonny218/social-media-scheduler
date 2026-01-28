import React, { useCallback, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Paper,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ImageList,
  ImageListItem,
  Checkbox,
  Skeleton,
  Tabs,
  Tab,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
  PhotoLibrary as LibraryIcon,
  DragIndicator as DragIcon,
} from '@mui/icons-material';
import { useDropzone, FileRejection } from 'react-dropzone';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { MediaService } from '../../services/media.service';
import { MediaItem } from '../../types';

export interface UploadedFile {
  id: string;
  file?: File;
  preview: string;
  type: 'image' | 'video';
  progress: number;
  uploaded: boolean;
  // For media library items
  isFromLibrary?: boolean;
  mediaItem?: MediaItem;
}

interface MediaUploaderProps {
  maxFiles?: number;
  acceptVideo?: boolean;
  files: UploadedFile[];
  onFilesChange: (files: UploadedFile[]) => void;
  onFileRemove: (fileId: string) => void;
}

const MediaUploader: React.FC<MediaUploaderProps> = ({
  maxFiles = 10,
  acceptVideo = true,
  files,
  onFilesChange,
  onFileRemove,
}) => {
  const { user } = useAuth();
  const [isDragActive, setIsDragActive] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedLibraryItems, setSelectedLibraryItems] = useState<Set<string>>(new Set());
  const [libraryTab, setLibraryTab] = useState<'all' | 'image' | 'video'>('all');

  const isCarousel = maxFiles > 1;

  // Load media library
  useEffect(() => {
    const loadLibrary = async () => {
      if (!libraryOpen || !user?.uid) return;

      setLibraryLoading(true);
      try {
        const mediaService = new MediaService(user.uid);
        const items = await mediaService.getAllMedia();
        setLibraryMedia(items);
      } catch (error) {
        console.error('Error loading media library:', error);
        toast.error('Failed to load media library');
      } finally {
        setLibraryLoading(false);
      }
    };

    loadLibrary();
  }, [libraryOpen, user?.uid]);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach((rejection) => {
          const errors = rejection.errors.map((e) => e.message).join(', ');
          toast.error(`${rejection.file.name}: ${errors}`);
        });
      }

      if (files.length + acceptedFiles.length > maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed`);
        return;
      }

      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        file,
        preview: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'image',
        progress: 0,
        uploaded: false,
        isFromLibrary: false,
      }));

      onFilesChange([...files, ...newFiles]);
    },
    [files, maxFiles, onFilesChange]
  );

  const { getRootProps, getInputProps, open: openFilePicker } = useDropzone({
    onDrop,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/webp': ['.webp'],
      ...(acceptVideo && {
        'video/mp4': ['.mp4'],
        'video/quicktime': ['.mov'],
      }),
    },
    maxSize: 100 * 1024 * 1024,
    multiple: isCarousel,
    noClick: files.length > 0,
    noKeyboard: files.length > 0,
  });

  const handleRemove = (fileId: string) => {
    const fileToRemove = files.find((f) => f.id === fileId);
    if (fileToRemove && !fileToRemove.isFromLibrary && fileToRemove.preview) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    onFileRemove(fileId);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;

    const items = Array.from(files);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    onFilesChange(items);
  };

  const handleLibraryOpen = () => {
    setSelectedLibraryItems(new Set());
    setLibraryOpen(true);
  };

  const handleLibraryClose = () => {
    setLibraryOpen(false);
    setSelectedLibraryItems(new Set());
  };

  const handleLibraryItemToggle = (itemId: string) => {
    const newSelected = new Set(selectedLibraryItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      // Check if adding would exceed max files
      if (files.length + newSelected.size >= maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed`);
        return;
      }
      newSelected.add(itemId);
    }
    setSelectedLibraryItems(newSelected);
  };

  const handleAddFromLibrary = () => {
    const selectedItems = libraryMedia.filter((item) => selectedLibraryItems.has(item.id));

    // Check if already added
    const existingIds = new Set(files.filter(f => f.isFromLibrary).map(f => f.mediaItem?.id));
    const newItems = selectedItems.filter(item => !existingIds.has(item.id));

    if (files.length + newItems.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const newFiles: UploadedFile[] = newItems.map((item) => ({
      id: `lib-${item.id}`,
      preview: item.downloadUrl,
      type: item.fileType,
      progress: 100,
      uploaded: true,
      isFromLibrary: true,
      mediaItem: item,
    }));

    onFilesChange([...files, ...newFiles]);
    handleLibraryClose();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const filteredLibraryMedia = libraryMedia.filter((item) => {
    if (libraryTab === 'all') return true;
    if (libraryTab === 'image') return item.fileType === 'image';
    if (libraryTab === 'video') return item.fileType === 'video';
    return true;
  }).filter((item) => {
    // Filter by acceptVideo prop
    if (!acceptVideo && item.fileType === 'video') return false;
    return true;
  });

  const renderMediaPreview = (file: UploadedFile, index: number, isDragging?: boolean) => (
    <Paper
      sx={{
        position: 'relative',
        paddingTop: '100%',
        borderRadius: 2,
        overflow: 'hidden',
        border: '2px solid',
        borderColor: isDragging ? 'primary.main' : 'divider',
        boxShadow: isDragging ? 4 : 1,
        transition: 'box-shadow 0.2s, border-color 0.2s',
      }}
    >
      {file.type === 'image' ? (
        <Box
          component="img"
          src={file.preview}
          alt={file.file?.name || 'Media'}
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
          component="video"
          src={file.preview}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* Order badge */}
      <Chip
        label={index + 1}
        size="small"
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          fontSize: '0.75rem',
          fontWeight: 600,
        }}
      />

      {/* Drag handle for carousel */}
      {isCarousel && (
        <Box
          sx={{
            position: 'absolute',
            top: 6,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: 1,
            px: 0.5,
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <DragIcon sx={{ fontSize: 16, color: 'white' }} />
        </Box>
      )}

      {/* Type/size badge */}
      <Chip
        icon={
          file.type === 'image' ? (
            <ImageIcon sx={{ fontSize: 14, color: 'inherit !important' }} />
          ) : (
            <VideoIcon sx={{ fontSize: 14, color: 'inherit !important' }} />
          )
        }
        label={file.isFromLibrary ? 'Library' : formatFileSize(file.file?.size || 0)}
        size="small"
        sx={{
          position: 'absolute',
          bottom: 8,
          left: 8,
          backgroundColor: file.isFromLibrary ? 'primary.main' : 'rgba(0,0,0,0.7)',
          color: 'white',
          fontSize: '0.7rem',
          '& .MuiChip-icon': {
            color: 'white',
          },
        }}
      />

      {/* Remove button */}
      <IconButton
        size="small"
        onClick={(e) => {
          e.stopPropagation();
          handleRemove(file.id);
        }}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: 'white',
          '&:hover': {
            backgroundColor: 'error.main',
          },
        }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>

      {/* Upload progress */}
      {!file.uploaded && file.progress > 0 && file.progress < 100 && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
          }}
        >
          <LinearProgress
            variant="determinate"
            value={file.progress}
            sx={{ height: 4 }}
          />
        </Box>
      )}
    </Paper>
  );

  return (
    <Box>
      {/* Empty state - show dropzone */}
      {files.length === 0 && (
        <Paper
          {...getRootProps()}
          sx={{
            p: 4,
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'divider',
            borderRadius: 2,
            backgroundColor: isDragActive ? 'action.hover' : 'background.paper',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: 'primary.main',
              backgroundColor: 'action.hover',
            },
          }}
        >
          <input {...getInputProps()} />
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <UploadIcon
              sx={{
                fontSize: 48,
                color: isDragActive ? 'primary.main' : 'text.secondary',
              }}
            />
            <Typography variant="body1" fontWeight={500}>
              {isDragActive
                ? 'Drop files here...'
                : 'Drag & drop files here, or click to select'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Supports: JPG, PNG, GIF, WebP{acceptVideo && ', MP4, MOV'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Max file size: 100MB | Max {maxFiles} file{maxFiles > 1 ? 's' : ''}
            </Typography>

            <Button
              variant="outlined"
              startIcon={<LibraryIcon />}
              onClick={(e) => {
                e.stopPropagation();
                handleLibraryOpen();
              }}
              sx={{ mt: 2 }}
            >
              Choose from Media Library
            </Button>
          </Box>
        </Paper>
      )}

      {/* Files preview with drag and drop */}
      {files.length > 0 && (
        <Box>
          {/* Action buttons */}
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={openFilePicker}
              disabled={files.length >= maxFiles}
            >
              Upload More
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<LibraryIcon />}
              onClick={handleLibraryOpen}
              disabled={files.length >= maxFiles}
            >
              From Library
            </Button>
            {isCarousel && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
                Drag to reorder • {files.length}/{maxFiles} files
              </Typography>
            )}
          </Box>

          {/* Hidden dropzone input */}
          <Box {...getRootProps()} sx={{ display: 'none' }}>
            <input {...getInputProps()} />
          </Box>

          {/* Draggable grid for carousel, regular grid otherwise */}
          {isCarousel ? (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="media-list" direction="horizontal">
                {(provided) => (
                  <Box
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    sx={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 2,
                    }}
                  >
                    {files.map((file, index) => (
                      <Draggable key={file.id} draggableId={file.id} index={index}>
                        {(provided, snapshot) => (
                          <Box
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            sx={{
                              width: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
                              flexShrink: 0,
                            }}
                          >
                            {renderMediaPreview(file, index, snapshot.isDragging)}
                          </Box>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </Box>
                )}
              </Droppable>
            </DragDropContext>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {files.map((file, index) => (
                <Box
                  key={file.id}
                  sx={{
                    width: { xs: 'calc(50% - 8px)', sm: 'calc(33.333% - 11px)', md: 'calc(25% - 12px)' },
                  }}
                >
                  {renderMediaPreview(file, index)}
                </Box>
              ))}
            </Box>
          )}
        </Box>
      )}

      {/* Media Library Dialog */}
      <Dialog
        open={libraryOpen}
        onClose={handleLibraryClose}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { height: '80vh' } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Select from Media Library</Typography>
          <IconButton onClick={handleLibraryClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs
            value={libraryTab}
            onChange={(_, value) => setLibraryTab(value)}
          >
            <Tab label="All" value="all" />
            <Tab label="Images" value="image" />
            {acceptVideo && <Tab label="Videos" value="video" />}
          </Tabs>
        </Box>

        <DialogContent sx={{ p: 2 }}>
          {libraryLoading ? (
            <ImageList cols={4} gap={12}>
              {[...Array(8)].map((_, i) => (
                <ImageListItem key={i}>
                  <Skeleton variant="rectangular" sx={{ width: '100%', paddingTop: '100%' }} />
                </ImageListItem>
              ))}
            </ImageList>
          ) : filteredLibraryMedia.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <LibraryIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">
                No media found in your library
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upload some images or videos to get started
              </Typography>
            </Box>
          ) : (
            <ImageList cols={4} gap={12}>
              {filteredLibraryMedia.map((item) => {
                const isSelected = selectedLibraryItems.has(item.id);
                const isAlreadyAdded = files.some(f => f.isFromLibrary && f.mediaItem?.id === item.id);

                return (
                  <ImageListItem
                    key={item.id}
                    onClick={() => !isAlreadyAdded && handleLibraryItemToggle(item.id)}
                    sx={{
                      cursor: isAlreadyAdded ? 'not-allowed' : 'pointer',
                      opacity: isAlreadyAdded ? 0.5 : 1,
                      position: 'relative',
                      borderRadius: 1,
                      overflow: 'hidden',
                      border: '3px solid',
                      borderColor: isSelected ? 'primary.main' : 'transparent',
                      transition: 'all 0.2s',
                      '&:hover': {
                        borderColor: isAlreadyAdded ? 'transparent' : isSelected ? 'primary.main' : 'primary.light',
                      },
                    }}
                  >
                    {item.fileType === 'image' ? (
                      <img
                        src={item.downloadUrl}
                        alt={item.fileName}
                        loading="lazy"
                        style={{
                          width: '100%',
                          aspectRatio: '1',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: '100%',
                          aspectRatio: '1',
                          backgroundColor: 'grey.200',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <VideoIcon sx={{ fontSize: 48, color: 'grey.500' }} />
                      </Box>
                    )}

                    {!isAlreadyAdded && (
                      <Checkbox
                        checked={isSelected}
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          backgroundColor: 'rgba(255,255,255,0.9)',
                          borderRadius: 1,
                          p: 0.25,
                          '&:hover': {
                            backgroundColor: 'rgba(255,255,255,1)',
                          },
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleLibraryItemToggle(item.id)}
                      />
                    )}

                    {isAlreadyAdded && (
                      <Chip
                        label="Added"
                        size="small"
                        sx={{
                          position: 'absolute',
                          top: 4,
                          right: 4,
                          backgroundColor: 'success.main',
                          color: 'white',
                          fontSize: '0.7rem',
                        }}
                      />
                    )}

                    {item.fileType === 'video' && (
                      <Chip
                        icon={<VideoIcon sx={{ fontSize: 12, color: 'inherit !important' }} />}
                        label="Video"
                        size="small"
                        sx={{
                          position: 'absolute',
                          bottom: 4,
                          left: 4,
                          backgroundColor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          fontSize: '0.65rem',
                          height: 20,
                          '& .MuiChip-icon': { color: 'white' },
                        }}
                      />
                    )}
                  </ImageListItem>
                );
              })}
            </ImageList>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
            {selectedLibraryItems.size} selected
          </Typography>
          <Button onClick={handleLibraryClose}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAddFromLibrary}
            disabled={selectedLibraryItems.size === 0}
          >
            Add Selected
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MediaUploader;
