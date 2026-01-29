import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import type { View, SlotInfo } from 'react-big-calendar';
import {
  format,
  parse,
  startOfWeek,
  getDay,
  startOfMonth,
  endOfMonth,
  endOfWeek,
  startOfDay,
  endOfDay,
} from 'date-fns';
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  loading: _loading = false,
  onDateRangeChange,
  onEventClick,
  onSlotClick,
}) => {
  const theme = useTheme();
  const [view, setView] = useState<View>(Views.MONTH);
  const [date, setDate] = useState(new Date());

  // Handle navigation
  const handleNavigate = useCallback(
    (newDate: Date) => {
      setDate(newDate);
    },
    []
  );

  // Handle view change
  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  // Keep date range in sync with current view/date
  useEffect(() => {
    if (!onDateRangeChange) return;

    if (view === Views.MONTH) {
      onDateRangeChange(startOfMonth(date), endOfMonth(date));
      return;
    }

    if (view === Views.WEEK) {
      onDateRangeChange(startOfWeek(date), endOfWeek(date));
      return;
    }

    onDateRangeChange(startOfDay(date), endOfDay(date));
  }, [date, view, onDateRangeChange]);

  // Handle event selection
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
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

  // Get status color
  const getStatusColor = useCallback((status: PostStatus): string => {
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
  }, [theme]);

  // Custom event style
  const eventStyleGetter = useCallback(
    (event: CalendarEvent) => {
      const status = event.resource.status;
      const accentColor = getStatusColor(status);

      if (view === Views.MONTH) {
        return {
          style: {
            backgroundColor: accentColor,
            borderRadius: '4px',
            opacity: 0.9,
            color: 'white',
            border: 'none',
            display: 'block',
            fontSize: '12px',
            padding: '2px 4px',
          },
        };
      }

      return {
        style: {
          backgroundColor: theme.palette.common.white,
          borderRadius: '8px',
          color: theme.palette.text.primary,
          border: `1px solid ${theme.palette.divider}`,
          borderLeft: `8px solid ${accentColor}`,
          display: 'block',
          fontSize: '12px',
          padding: '6px 8px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        },
      };
    },
    [getStatusColor, theme, view]
  );

  // Custom event component
  const EventComponent = useMemo(
    () =>
      ({ event }: { event: CalendarEvent }) => {
        const post = event.resource;
        const thumbnailUrl =
          post.reelCover?.url ||
          post.media?.[0]?.thumbnailUrl ||
          post.media?.[0]?.url;
        const title = post.caption?.trim() || `${post.postType} post`;
        const startTime = format(event.start, 'h:mm a');
        const statusLabel = post.status.charAt(0).toUpperCase() + post.status.slice(1);
        const typeLabel = post.postType.charAt(0).toUpperCase() + post.postType.slice(1);

        if (view === Views.MONTH) {
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
                    width: 18,
                    height: 18,
                    borderRadius: 0.5,
                    objectFit: 'cover',
                    flexShrink: 0,
                  }}
                />
              )}
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontWeight: 600,
                    lineHeight: 1.15,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {title}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    lineHeight: 1.1,
                    opacity: 0.9,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {`${typeLabel} - ${statusLabel}`}
                </Typography>
              </Box>
            </Box>
          );
        }

        return (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              alignItems: 'center',
              height: '100%',
              overflow: 'hidden',
            }}
          >
            {thumbnailUrl ? (
              <Box
                component="img"
                src={thumbnailUrl}
                alt=""
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  objectFit: 'cover',
                  flexShrink: 0,
                  border: `1px solid ${theme.palette.divider}`,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 1,
                  backgroundColor: theme.palette.grey[200],
                  flexShrink: 0,
                }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ lineHeight: 1.2, display: 'block', mb: 0.25 }}
              >
                {startTime}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.2,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {title}
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ lineHeight: 1.2 }}
              >
                {`${typeLabel} - ${statusLabel}`}
              </Typography>
            </Box>
          </Box>
        );
      },
    [theme, view]
  );

  // Components configuration
  const components = useMemo(
    () => ({
      event: EventComponent,
    }),
    [EventComponent]
  );

  return (
    <Box sx={{ width: '100%', minHeight: 640 }}>
      <Paper
        sx={{
          height: 700,
          p: 2,
          '& .rbc-calendar': {
            fontFamily: theme.typography.fontFamily,
            height: '100%',
          },
          '& .rbc-month-view': {
            height: '100%',
          },
          '& .rbc-month-row': {
            minHeight: 90,
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
          '& .rbc-time-view .rbc-event': {
            minHeight: 84,
          },
          '& .rbc-time-view .rbc-event-label': {
            display: 'none',
          },
          '& .rbc-time-view .rbc-event-content': {
            height: '100%',
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
    </Box>
  );
};

export default CalendarView;
