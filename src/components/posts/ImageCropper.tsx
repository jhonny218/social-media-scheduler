import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  IconButton,
  Typography,
  Slider,
} from '@mui/material';
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from '@mui/icons-material';

interface ImageCropperProps {
  open: boolean;
  onClose: () => void;
  imageSrc: string;
  aspectRatio: number; // width / height (e.g., 9/16 = 0.5625)
  onCrop: (croppedDataUrl: string) => void;
}

const ImageCropper: React.FC<ImageCropperProps> = ({
  open,
  onClose,
  imageSrc,
  aspectRatio,
  onCrop,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [cropAreaSize, setCropAreaSize] = useState({ width: 0, height: 0 });

  // Calculate crop area size based on container and aspect ratio
  useEffect(() => {
    if (!containerRef.current) return;

    const containerHeight = 400;
    const element = containerRef.current;

    const updateCropArea = () => {
      const containerWidth = element.clientWidth - 48; // Padding

      let cropWidth: number;
      let cropHeight: number;

      if (containerWidth / containerHeight > aspectRatio) {
        // Container is wider than aspect ratio
        cropHeight = containerHeight * 0.8;
        cropWidth = cropHeight * aspectRatio;
      } else {
        // Container is taller than aspect ratio
        cropWidth = containerWidth * 0.8;
        cropHeight = cropWidth / aspectRatio;
      }

      setCropAreaSize({ width: cropWidth, height: cropHeight });
    };

    const rafId = requestAnimationFrame(updateCropArea);
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateCropArea);
    });

    resizeObserver.observe(element);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
    };
  }, [aspectRatio, open]);

  // Load image
  useEffect(() => {
    if (!imageSrc) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);

      // Calculate initial scale to fit image in crop area
      const scaleX = cropAreaSize.width / img.width;
      const scaleY = cropAreaSize.height / img.height;
      const initialScale = Math.max(scaleX, scaleY) * 1.1;
      setScale(initialScale);
      setPosition({ x: 0, y: 0 });
    };
    img.src = imageSrc;

    return () => {
      imageRef.current = null;
    };
  }, [imageSrc, cropAreaSize]);

  // Handle mouse/touch events for dragging
  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDragging(true);
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setDragStart({ x: clientX - position.x, y: clientY - position.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setPosition({
      x: clientX - dragStart.x,
      y: clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleMouseMove);
      window.addEventListener('touchend', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleMouseMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // Handle zoom
  const handleZoomChange = (_: Event, value: number | number[]) => {
    setScale(value as number);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.1, 0.5));
  };

  // Perform crop
  const handleCrop = () => {
    if (!canvasRef.current || !imageRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imageRef.current;

    // Output size (Instagram Reel cover size)
    const outputWidth = 1080;
    const outputHeight = 1920;

    canvas.width = outputWidth;
    canvas.height = outputHeight;

    // Calculate the crop area in image coordinates
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerCenterX = containerRect.width / 2;
    const containerCenterY = 200; // Center of crop area

    // Image position in container
    const imageWidth = img.width * scale;
    const imageHeight = img.height * scale;
    const imageX = containerCenterX + position.x - imageWidth / 2;
    const imageY = containerCenterY + position.y - imageHeight / 2;

    // Crop area position
    const cropX = containerCenterX - cropAreaSize.width / 2;
    const cropY = containerCenterY - cropAreaSize.height / 2;

    // Calculate source coordinates in original image
    const sourceX = ((cropX - imageX) / scale);
    const sourceY = ((cropY - imageY) / scale);
    const sourceWidth = cropAreaSize.width / scale;
    const sourceHeight = cropAreaSize.height / scale;

    // Draw cropped image
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    onCrop(croppedDataUrl);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">Crop Image</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        {/* Hidden canvas for cropping */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Crop container */}
        <Box
          ref={containerRef}
          sx={{
            position: 'relative',
            height: 400,
            backgroundColor: 'grey.900',
            borderRadius: 2,
            overflow: 'hidden',
            cursor: isDragging ? 'grabbing' : 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseDown={handleMouseDown}
          onTouchStart={handleMouseDown}
        >
          {/* Image */}
          {imageLoaded && (
            <Box
              component="img"
              src={imageSrc}
              sx={{
                position: 'absolute',
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                transformOrigin: 'center',
                maxWidth: 'none',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
              draggable={false}
            />
          )}

          {/* Overlay with crop area cutout */}
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
            }}
          >
            {/* Top overlay */}
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: `calc(50% - ${cropAreaSize.height / 2}px)`,
                backgroundColor: 'rgba(0,0,0,0.6)',
              }}
            />
            {/* Bottom overlay */}
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: `calc(50% - ${cropAreaSize.height / 2}px)`,
                backgroundColor: 'rgba(0,0,0,0.6)',
              }}
            />
            {/* Left overlay */}
            <Box
              sx={{
                position: 'absolute',
                top: `calc(50% - ${cropAreaSize.height / 2}px)`,
                left: 0,
                width: `calc(50% - ${cropAreaSize.width / 2}px)`,
                height: cropAreaSize.height,
                backgroundColor: 'rgba(0,0,0,0.6)',
              }}
            />
            {/* Right overlay */}
            <Box
              sx={{
                position: 'absolute',
                top: `calc(50% - ${cropAreaSize.height / 2}px)`,
                right: 0,
                width: `calc(50% - ${cropAreaSize.width / 2}px)`,
                height: cropAreaSize.height,
                backgroundColor: 'rgba(0,0,0,0.6)',
              }}
            />

            {/* Crop area border */}
            <Box
              sx={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: cropAreaSize.width,
                height: cropAreaSize.height,
                border: '2px solid white',
                borderRadius: 1,
              }}
            />
          </Box>
        </Box>

        {/* Zoom controls */}
        <Box sx={{ mt: 3, px: 2 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Zoom
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton size="small" onClick={handleZoomOut}>
              <ZoomOutIcon />
            </IconButton>
            <Slider
              value={scale}
              onChange={handleZoomChange}
              min={0.5}
              max={3}
              step={0.01}
              sx={{ flex: 1 }}
            />
            <IconButton size="small" onClick={handleZoomIn}>
              <ZoomInIcon />
            </IconButton>
          </Box>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
          Drag the image to position it within the crop area
        </Typography>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleCrop}>
          Apply Crop
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ImageCropper;
