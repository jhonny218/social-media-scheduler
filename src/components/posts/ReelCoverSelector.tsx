import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  Typography,
  Tabs,
  Tab,
  Slider,
  ImageList,
  ImageListItem,
  Alert,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import {
  Close as CloseIcon,
  Videocam as VideoIcon,
  Image as ImageIcon,
  Edit as EditIcon,
  Cached as ChangeIcon,
  PhotoLibrary as LibraryIcon,
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { MediaService } from '../../services/media.service';
import { MediaItem } from '../../types';
import ImageCropper from './ImageCropper';

interface ReelCoverSelectorProps {
  open: boolean;
  onClose: () => void;
  videoUrl: string;
  onSelectCover: (coverData: { type: 'frame' | 'custom'; data: string; timestamp?: number; storagePath?: string }) => void;
  initialCover?: { type: 'frame' | 'custom'; data: string; timestamp?: number };
}

const ReelCoverSelector: React.FC<ReelCoverSelectorProps> = ({
  open,
  onClose,
  videoUrl,
  onSelectCover,
  initialCover,
}) => {
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [activeTab, setActiveTab] = useState<'frame' | 'custom'>(initialCover?.type || 'frame');
  const [frames, setFrames] = useState<string[]>([]);
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);

  // Custom image state
  const [customImage, setCustomImage] = useState<string | null>(initialCover?.type === 'custom' ? initialCover.data : null);
  const [customImageStoragePath, setCustomImageStoragePath] = useState<string | undefined>(undefined);
  const [customImageValid, setCustomImageValid] = useState(true);
  const [showCropper, setShowCropper] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Media library state
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryMedia, setLibraryMedia] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // Extract frames from video
  const extractFrames = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setLoadingFrames(true);

    try {
      // Wait for video metadata with timeout
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video metadata loading timeout'));
        }, 10000);

        if (video.readyState >= 1) {
          clearTimeout(timeout);
          resolve();
        } else {
          video.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          video.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Video failed to load'));
          };
        }
      });

      const videoDuration = video.duration;
      if (!videoDuration || isNaN(videoDuration)) {
        throw new Error('Invalid video duration');
      }
      setDuration(videoDuration);

      // Set canvas size to match video
      const videoWidth = video.videoWidth || 1080;
      const videoHeight = video.videoHeight || 1920;
      canvas.width = videoWidth;
      canvas.height = videoHeight;

      // Extract 8 frames at regular intervals
      const frameCount = 8;
      const extractedFrames: string[] = [];

      for (let i = 0; i < frameCount; i++) {
        const time = (videoDuration / frameCount) * i;

        try {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              resolve(); // Don't reject, just skip this frame
            }, 3000);

            video.currentTime = time;
            video.onseeked = () => {
              clearTimeout(timeout);
              try {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                extractedFrames.push(dataUrl);
              } catch (e) {
                console.warn('Could not extract frame (CORS?):', e);
              }
              resolve();
            };
          });
        } catch (e) {
          console.warn('Frame extraction error:', e);
        }
      }

      setFrames(extractedFrames);
      if (extractedFrames.length > 0) {
        setPreviewFrame(extractedFrames[0]);
      }
    } catch (error) {
      console.error('Video frame extraction failed:', error);
    } finally {
      setLoadingFrames(false);
    }
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setFrames([]);
      setPreviewFrame(null);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [open]);

  // Load video and extract frames
  useEffect(() => {
    if (open && videoUrl && activeTab === 'frame') {
      // Ensure video element reloads the source
      if (videoRef.current) {
        videoRef.current.load();
      }
      // Small delay to ensure video element is ready
      const timer = setTimeout(() => {
        extractFrames();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, videoUrl, activeTab, extractFrames]);

  // Handle slider change for frame selection
  const handleSliderChange = (_: Event, value: number | number[]) => {
    const time = value as number;
    setCurrentTime(time);

    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      video.currentTime = time;
      video.onseeked = () => {
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          setPreviewFrame(dataUrl);
        }
      };
    }
  };

  // Handle frame thumbnail click
  const handleFrameClick = (index: number) => {
    setSelectedFrameIndex(index);
    setPreviewFrame(frames[index]);
    const time = (duration / frames.length) * index;
    setCurrentTime(time);
  };

  // Load media library
  const loadLibrary = async () => {
    if (!user?.uid) return;

    setLibraryLoading(true);
    try {
      const mediaService = new MediaService(user.uid);
      const items = await mediaService.getAllMedia();
      // Filter to only images
      setLibraryMedia(items.filter(item => item.fileType === 'image'));
    } catch (error) {
      console.error('Error loading media library:', error);
    } finally {
      setLibraryLoading(false);
    }
  };

  // Check if image has valid 9:16 aspect ratio
  const checkImageAspectRatio = (imageUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const aspectRatio = img.width / img.height;
        // 9:16 = 0.5625, allow some tolerance (0.54 - 0.58)
        const isValid = aspectRatio >= 0.54 && aspectRatio <= 0.58;
        resolve(isValid);
      };
      img.onerror = () => resolve(false);
      img.src = imageUrl;
    });
  };

  // Handle custom image selection from library
  const handleLibrarySelect = async (item: MediaItem) => {
    setShowLibrary(false);
    const isValid = await checkImageAspectRatio(item.downloadUrl);
    setCustomImage(item.downloadUrl);
    setCustomImageStoragePath(item.storagePath);
    setCustomImageValid(isValid);
    if (!isValid) {
      setImageToCrop(item.downloadUrl);
    }
  };

  // Handle file upload for custom image
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const isValid = await checkImageAspectRatio(dataUrl);
      setCustomImage(dataUrl);
      setCustomImageStoragePath(undefined); // New upload, no existing storage path
      setCustomImageValid(isValid);
      if (!isValid) {
        setImageToCrop(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle cropped image
  const handleCroppedImage = (croppedDataUrl: string) => {
    setCustomImage(croppedDataUrl);
    setCustomImageStoragePath(undefined); // Cropped image is new base64, needs upload
    setCustomImageValid(true);
    setShowCropper(false);
    setImageToCrop(null);
  };

  // Format time for display
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle save
  const handleSave = () => {
    if (activeTab === 'frame' && previewFrame) {
      onSelectCover({ type: 'frame', data: previewFrame, timestamp: currentTime });
    } else if (activeTab === 'custom' && customImage && customImageValid) {
      onSelectCover({ type: 'custom', data: customImage, storagePath: customImageStoragePath });
    }
    onClose();
  };

  return (
    <>
      <Dialog
        open={open && !showLibrary && !showCropper}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Edit Cover</Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)}>
            <Tab
              label="Video Frame"
              value="frame"
              icon={<VideoIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
            <Tab
              label="Custom Image"
              value="custom"
              icon={<ImageIcon sx={{ fontSize: 18 }} />}
              iconPosition="start"
            />
          </Tabs>
        </Box>

        <DialogContent sx={{ minHeight: 400 }}>
          {/* Hidden video and canvas for frame extraction */}
          <video
            ref={videoRef}
            src={videoUrl}
            style={{ display: 'none' }}
            crossOrigin={videoUrl.startsWith('blob:') ? undefined : 'anonymous'}
            preload="auto"
            muted
            playsInline
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {activeTab === 'frame' && (
            <Box>
              {/* Preview */}
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  mb: 2,
                  backgroundColor: 'grey.100',
                  borderRadius: 2,
                  p: 2,
                }}
              >
                {loadingFrames ? (
                  <Box
                    sx={{
                      width: 180,
                      height: 320,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                  >
                    <CircularProgress />
                    <Typography variant="caption" color="text.secondary">
                      Extracting frames...
                    </Typography>
                  </Box>
                ) : previewFrame ? (
                  <Box
                    component="img"
                    src={previewFrame}
                    sx={{
                      maxHeight: 320,
                      maxWidth: '100%',
                      borderRadius: 1,
                      objectFit: 'contain',
                    }}
                  />
                ) : (
                  <Box
                    sx={{
                      width: 180,
                      height: 320,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexDirection: 'column',
                      backgroundColor: 'grey.200',
                      borderRadius: 1,
                      p: 2,
                      textAlign: 'center',
                    }}
                  >
                    <VideoIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">
                      Could not extract frames
                    </Typography>
                    <Button
                      size="small"
                      onClick={() => setActiveTab('custom')}
                      sx={{ mt: 1 }}
                    >
                      Use Custom Image
                    </Button>
                  </Box>
                )}
              </Box>

              {/* Slider */}
              <Box sx={{ mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography variant="body2" color="text.secondary">
                    Drag to Select Cover
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </Typography>
                </Box>
                <Slider
                  value={currentTime}
                  onChange={handleSliderChange}
                  min={0}
                  max={duration || 100}
                  step={0.1}
                  disabled={loadingFrames || duration === 0}
                />
              </Box>

              {/* Frame thumbnails */}
              <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1 }}>
                {loadingFrames
                  ? [...Array(8)].map((_, i) => (
                      <Skeleton
                        key={i}
                        variant="rectangular"
                        sx={{ width: 60, height: 80, flexShrink: 0, borderRadius: 1 }}
                      />
                    ))
                  : frames.map((frame, index) => (
                      <Box
                        key={index}
                        onClick={() => handleFrameClick(index)}
                        sx={{
                          width: 60,
                          height: 80,
                          flexShrink: 0,
                          borderRadius: 1,
                          overflow: 'hidden',
                          cursor: 'pointer',
                          border: '2px solid',
                          borderColor: selectedFrameIndex === index ? 'primary.main' : 'transparent',
                          transition: 'border-color 0.2s',
                          '&:hover': {
                            borderColor: selectedFrameIndex === index ? 'primary.main' : 'primary.light',
                          },
                        }}
                      >
                        <Box
                          component="img"
                          src={frame}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Box>
                    ))}
              </Box>
            </Box>
          )}

          {activeTab === 'custom' && (
            <Box>
              {customImage ? (
                <Box>
                  {/* Preview */}
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'center',
                      mb: 2,
                      backgroundColor: 'grey.100',
                      borderRadius: 2,
                      p: 2,
                      position: 'relative',
                    }}
                  >
                    <Box
                      component="img"
                      src={customImage}
                      sx={{
                        maxHeight: 320,
                        maxWidth: '100%',
                        borderRadius: 1,
                        objectFit: 'contain',
                      }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => {
                        setCustomImage(null);
                        setCustomImageValid(true);
                      }}
                      sx={{
                        position: 'absolute',
                        top: 16,
                        right: 16,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        color: 'white',
                        '&:hover': { backgroundColor: 'rgba(0,0,0,0.7)' },
                      }}
                    >
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>

                  {/* Validation warning */}
                  {!customImageValid && (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Image size not valid for Instagram Reel cover. Use the Edit tool to crop it to an aspect ratio of 9:16.
                    </Alert>
                  )}

                  {/* Action buttons */}
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {!customImageValid && (
                      <Button
                        variant="outlined"
                        startIcon={<EditIcon />}
                        onClick={() => {
                          setImageToCrop(customImage);
                          setShowCropper(true);
                        }}
                      >
                        Edit Image
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      startIcon={<ChangeIcon />}
                      onClick={() => setShowLibrary(true)}
                    >
                      Change Image
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    py: 4,
                  }}
                >
                  <ImageIcon sx={{ fontSize: 64, color: 'text.disabled' }} />
                  <Typography color="text.secondary">
                    Select an image for your Reel cover
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Recommended: 9:16 aspect ratio (1080x1920)
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                    <Button
                      variant="outlined"
                      startIcon={<LibraryIcon />}
                      onClick={() => {
                        loadLibrary();
                        setShowLibrary(true);
                      }}
                    >
                      From Library
                    </Button>
                    <Button variant="contained" component="label">
                      Upload Image
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileUpload}
                      />
                    </Button>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
          <Button onClick={onClose}>Discard Changes</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={
              (activeTab === 'frame' && !previewFrame) ||
              (activeTab === 'custom' && (!customImage || !customImageValid))
            }
          >
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>

      {/* Media Library Dialog */}
      <Dialog
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ paper: { sx: { height: '70vh' } } }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">Select Cover Image</Typography>
          <IconButton onClick={() => setShowLibrary(false)} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2 }}>
          {libraryLoading ? (
            <ImageList cols={4} gap={12}>
              {[...Array(8)].map((_, i) => (
                <ImageListItem key={i}>
                  <Skeleton variant="rectangular" sx={{ width: '100%', paddingTop: '177%' }} />
                </ImageListItem>
              ))}
            </ImageList>
          ) : libraryMedia.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <ImageIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
              <Typography color="text.secondary">No images in your library</Typography>
            </Box>
          ) : (
            <ImageList cols={4} gap={12}>
              {libraryMedia.map((item) => (
                <ImageListItem
                  key={item.id}
                  onClick={() => handleLibrarySelect(item)}
                  sx={{
                    cursor: 'pointer',
                    borderRadius: 1,
                    overflow: 'hidden',
                    '&:hover': { opacity: 0.8 },
                  }}
                >
                  <img
                    src={item.downloadUrl}
                    alt={item.fileName}
                    loading="lazy"
                    style={{ width: '100%', aspectRatio: '9/16', objectFit: 'cover' }}
                  />
                </ImageListItem>
              ))}
            </ImageList>
          )}
        </DialogContent>
      </Dialog>

      {/* Image Cropper Dialog */}
      {showCropper && imageToCrop && (
        <ImageCropper
          open={showCropper}
          onClose={() => {
            setShowCropper(false);
            setImageToCrop(null);
          }}
          imageSrc={imageToCrop}
          aspectRatio={9 / 16}
          onCrop={handleCroppedImage}
        />
      )}
    </>
  );
};

export default ReelCoverSelector;
