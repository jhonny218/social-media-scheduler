import React, { useCallback, useState } from 'react';
import {
  Box,
  Typography,
  IconButton,
  LinearProgress,
  Grid,
  Paper,
  Chip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Close as CloseIcon,
  Image as ImageIcon,
  Videocam as VideoIcon,
} from '@mui/icons-material';
import { useDropzone, FileRejection } from 'react-dropzone';
import toast from 'react-hot-toast';

interface UploadedFile {
  id: string;
  file: File;
  preview: string;
  type: 'image' | 'video';
  progress: number;
  uploaded: boolean;
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
  const [isDragActive, setIsDragActive] = useState(false);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      // Handle rejected files
      if (rejectedFiles.length > 0) {
        rejectedFiles.forEach((rejection) => {
          const errors = rejection.errors.map((e) => e.message).join(', ');
          toast.error(`${rejection.file.name}: ${errors}`);
        });
      }

      // Check max files limit
      if (files.length + acceptedFiles.length > maxFiles) {
        toast.error(`Maximum ${maxFiles} files allowed`);
        return;
      }

      // Create preview URLs and add to files
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        preview: URL.createObjectURL(file),
        type: file.type.startsWith('video/') ? 'video' : 'image',
        progress: 0,
        uploaded: false,
      }));

      onFilesChange([...files, ...newFiles]);
    },
    [files, maxFiles, onFilesChange]
  );

  const { getRootProps, getInputProps } = useDropzone({
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
    maxSize: 100 * 1024 * 1024, // 100MB
    multiple: true,
  });

  const handleRemove = (fileId: string) => {
    const fileToRemove = files.find((f) => f.id === fileId);
    if (fileToRemove) {
      URL.revokeObjectURL(fileToRemove.preview);
    }
    onFileRemove(fileId);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Box>
      {/* Dropzone */}
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
            Max file size: 100MB | Max {maxFiles} files
          </Typography>
        </Box>
      </Paper>

      {/* Preview Grid */}
      {files.length > 0 && (
        <Grid container spacing={2} sx={{ mt: 2 }}>
          {files.map((file, index) => (
            <Grid key={file.id} size={{ xs: 6, sm: 4, md: 3 }}>
              <Paper
                sx={{
                  position: 'relative',
                  paddingTop: '100%',
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              >
                {/* Preview */}
                {file.type === 'image' ? (
                  <Box
                    component="img"
                    src={file.preview}
                    alt={file.file.name}
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
                  }}
                />

                {/* Type badge */}
                <Chip
                  icon={
                    file.type === 'image' ? (
                      <ImageIcon sx={{ fontSize: 14, color: 'inherit !important' }} />
                    ) : (
                      <VideoIcon sx={{ fontSize: 14, color: 'inherit !important' }} />
                    )
                  }
                  label={formatFileSize(file.file.size)}
                  size="small"
                  sx={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    backgroundColor: 'rgba(0,0,0,0.7)',
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
                      backgroundColor: 'rgba(0,0,0,0.7)',
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
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
};

export default MediaUploader;
