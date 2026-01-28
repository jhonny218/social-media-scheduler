import React, { useState, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Chip,
  Divider,
  useTheme,
} from '@mui/material';
import {
  Close as CloseIcon,
  Schedule as ScheduleIcon,
  CheckCircle as PublishedIcon,
  Error as FailedIcon,
} from '@mui/icons-material';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View, SlotInfo } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, startOfMonth, endOfMonth } from 'date-fns';
import { enUS } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import type { CalendarEvent, ScheduledPost, PostStatus } from '../../types';

// Configure date-fns localizer
const locales = {
  'en-US': enUS,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

interface CalendarViewProps {
  events: CalendarEvent[];
  loading?: boolean;
  onDateRangeChange?: (start: Date, end: Date) => void;
  onEventClick?: (post: ScheduledPost) => void;
  onSlotClick?: (slotInfo: SlotInfo) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  loading = false,
  onDateRangeChange,
  onEventClick,
  onSlotClick,
}) => {
  const theme = useTheme();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Handle navigation
  const handleNavigate = useCallback(
    (newDate: Date) => {
      setDate(newDate);
      if (onDateRangeChange) {
        const start = startOfMonth(newDate);
        const end = endOfMonth(newDate);
        onDateRangeChange(start, end);
      }
    },
    [onDateRangeChange]
  );

  // Handle view change
  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  // Handle event selection
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      setSelectedEvent(event);
      setDetailsOpen(true);
      onEventClick?.(event.resource);
    },
    [onEventClick]
  );

  // Handle slot selection (for creating new posts)
  const handleSelectSlot = useCallback(
    (slotInfo: SlotInfo) => {
      onSlotClick?.(slotInfo);
    },
    [onSlotClick]
  );

  // Close details dialog
  const handleCloseDetails = () => {
    setDetailsOpen(false);
    setSelectedEvent(null);
  };

  // Get status color
  const getStatusColor = (status: PostStatus): string => {
    switch (status) {
      case 'published':
        return theme.palette.success.main;
      case 'scheduled':
        return theme.palette.info.main;
      case 'publishing':
        return theme.palette.warning.main;
      case 'failed':
        return theme.palette.error.main;
      case 'draft':
      default:
        return theme.palette.grey[500];
    }
  };

  // Custom event style
  const eventStyleGetter = useCallback(
    (event: CalendarEvent) => {
      const status = event.resource.status;
      const backgroundColor = getStatusColor(status);

      return {
        style: {
          backgroundColor,
          borderRadius: '4px',
          opacity: 0.9,
          color: 'white',
          border: 'none',
          display: 'block',
          fontSize: '12px',
          padding: '2px 4px',
        },
      };
    },
    [theme]
  );

  // Custom event component
  const EventComponent = useMemo(
    () =>
      ({ event }: { event: CalendarEvent }) => {
        const post = event.resource;
        const thumbnailUrl = post.media?.[0]?.url;

        return (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              overflow: 'hidden',
            }}
          >
            {thumbnailUrl && (
              <Box
                component="img"
                src={thumbnailUrl}
                alt=""
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: 0.5,
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {event.title}
            </Typography>
          </Box>
        );
      },
    []
  );

  // Components configuration
  const components = useMemo(
    () => ({
      event: EventComponent,
    }),
    [EventComponent]
  );

  return (
    <Box sx={{ height: '100%', minHeight: 600 }}>
      <Paper
        sx={{
          height: '100%',
          p: 2,
          '& .rbc-calendar': {
            fontFamily: theme.typography.fontFamily,
          },
          '& .rbc-header': {
            padding: '8px',
            fontWeight: 600,
            backgroundColor: theme.palette.grey[50],
          },
          '& .rbc-today': {
            backgroundColor: theme.palette.primary.light + '20',
          },
          '& .rbc-off-range-bg': {
            backgroundColor: theme.palette.grey[50],
          },
          '& .rbc-event': {
            padding: '2px 4px',
          },
          '& .rbc-event:focus': {
            outline: `2px solid ${theme.palette.primary.main}`,
          },
          '& .rbc-toolbar': {
            marginBottom: '16px',
            flexWrap: 'wrap',
            gap: '8px',
          },
          '& .rbc-toolbar button': {
            borderRadius: '4px',
            border: `1px solid ${theme.palette.divider}`,
            padding: '6px 12px',
            '&:hover': {
              backgroundColor: theme.palette.action.hover,
            },
            '&.rbc-active': {
              backgroundColor: theme.palette.primary.main,
              color: 'white',
              borderColor: theme.palette.primary.main,
            },
          },
          '& .rbc-btn-group': {
            '& button + button': {
              marginLeft: '-1px',
            },
          },
        }}
      >
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={view}
          date={date}
          onNavigate={handleNavigate}
          onView={handleViewChange}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          eventPropGetter={eventStyleGetter}
          components={components}
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          popup
          step={30}
          showMultiDayTimes
        />
      </Paper>

      {/* Event Details Dialog */}
      <Dialog
        open={detailsOpen}
        onClose={handleCloseDetails}
        maxWidth="sm"
        fullWidth
      >
        {selectedEvent && (
          <>
            <DialogTitle
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Typography variant="h6">Post Details</Typography>
              <IconButton onClick={handleCloseDetails} size="small">
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {/* Media Preview */}
              {selectedEvent.resource.media?.[0]?.url && (
                <Box
                  sx={{
                    width: '100%',
                    paddingTop: '56.25%', // 16:9 aspect ratio
                    position: 'relative',
                    borderRadius: 2,
                    overflow: 'hidden',
                    mb: 2,
                  }}
                >
                  {selectedEvent.resource.media[0].type === 'video' ? (
                    <Box
                      component="video"
                      src={selectedEvent.resource.media[0].url}
                      controls
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
                      component="img"
                      src={selectedEvent.resource.media[0].url}
                      alt="Post media"
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
                </Box>
              )}

              {/* Status */}
              <Box sx={{ mb: 2 }}>
                <Chip
                  icon={
                    selectedEvent.resource.status === 'published' ? (
                      <PublishedIcon />
                    ) : selectedEvent.resource.status === 'failed' ? (
                      <FailedIcon />
                    ) : (
                      <ScheduleIcon />
                    )
                  }
                  label={selectedEvent.resource.status}
                  color={
                    selectedEvent.resource.status === 'published'
                      ? 'success'
                      : selectedEvent.resource.status === 'failed'
                      ? 'error'
                      : 'info'
                  }
                  sx={{ textTransform: 'capitalize' }}
                />
                <Chip
                  label={selectedEvent.resource.postType}
                  variant="outlined"
                  sx={{ ml: 1, textTransform: 'capitalize' }}
                />
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Caption */}
              <Typography variant="subtitle2" gutterBottom>
                Caption
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {selectedEvent.resource.caption || 'No caption'}
              </Typography>

              {/* First Comment */}
              {selectedEvent.resource.firstComment && (
                <>
                  <Typography variant="subtitle2" gutterBottom>
                    First Comment
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {selectedEvent.resource.firstComment}
                  </Typography>
                </>
              )}

              {/* Schedule Time */}
              <Typography variant="subtitle2" gutterBottom>
                Scheduled For
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {format(selectedEvent.start, 'MMMM d, yyyy h:mm a')}
              </Typography>

              {/* Error Message */}
              {selectedEvent.resource.status === 'failed' &&
                selectedEvent.resource.errorMessage && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" color="error" gutterBottom>
                      Error
                    </Typography>
                    <Typography variant="body2" color="error">
                      {selectedEvent.resource.errorMessage}
                    </Typography>
                  </Box>
                )}
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCloseDetails}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CalendarView;
