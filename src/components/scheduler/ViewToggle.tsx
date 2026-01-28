import React from 'react';
import {
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Box,
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  GridView as GridIcon,
} from '@mui/icons-material';

export type ViewType = 'calendar' | 'grid';

interface ViewToggleProps {
  view: ViewType;
  onChange: (view: ViewType) => void;
  disabled?: boolean;
}

const ViewToggle: React.FC<ViewToggleProps> = ({
  view,
  onChange,
  disabled = false,
}) => {
  const handleChange = (
    _event: React.MouseEvent<HTMLElement>,
    newView: ViewType | null
  ) => {
    if (newView !== null) {
      onChange(newView);
    }
  };

  return (
    <ToggleButtonGroup
      value={view}
      exclusive
      onChange={handleChange}
      aria-label="view toggle"
      size="small"
      disabled={disabled}
    >
      <Tooltip title="Calendar View" placement="bottom">
        <ToggleButton
          value="calendar"
          aria-label="calendar view"
          sx={{
            px: 2,
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'white',
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
            },
          }}
        >
          <CalendarIcon sx={{ mr: 1 }} />
          Calendar
        </ToggleButton>
      </Tooltip>

      <Tooltip title="Instagram Grid Preview" placement="bottom">
        <ToggleButton
          value="grid"
          aria-label="grid view"
          sx={{
            px: 2,
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'white',
              '&:hover': {
                backgroundColor: 'primary.dark',
              },
            },
          }}
        >
          <GridIcon sx={{ mr: 1 }} />
          Grid
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
};

export default ViewToggle;
