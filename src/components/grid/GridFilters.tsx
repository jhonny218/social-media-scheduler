import React from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Chip,
  Avatar,
  Typography,
  Paper,
  Divider,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import {
  Instagram as InstagramIcon,
  Movie as ReelIcon,
  Collections as CarouselIcon,
  GridView as GridIcon,
} from '@mui/icons-material';
import { InstagramAccount } from '../../types';

export type GridViewMode = 'all' | 'reels';

interface GridFiltersProps {
  selectedAccount: string;
  accounts: InstagramAccount[];
  onAccountChange: (accountId: string) => void;
  gridView: GridViewMode;
  onGridViewChange: (view: GridViewMode) => void;
  showCarousels: boolean;
  onShowCarouselsChange: (show: boolean) => void;
  dateRange: string;
  onDateRangeChange: (range: string) => void;
  totalPosts: number;
  filteredCount: number;
}

const GridFilters: React.FC<GridFiltersProps> = ({
  selectedAccount,
  accounts,
  onAccountChange,
  gridView,
  onGridViewChange,
  showCarousels,
  onShowCarouselsChange,
  dateRange,
  onDateRangeChange,
  totalPosts,
  filteredCount,
}) => {
  return (
    <Paper sx={{ p: 2, mb: 3 }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left side filters */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'center' }}>
          {/* Account Filter */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Instagram Account</InputLabel>
            <Select
              value={selectedAccount}
              label="Instagram Account"
              onChange={(e) => onAccountChange(e.target.value)}
            >
              <MenuItem value="all">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <InstagramIcon fontSize="small" />
                  All Accounts
                </Box>
              </MenuItem>
              {accounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar
                      src={account.profilePictureUrl}
                      sx={{ width: 24, height: 24 }}
                    >
                      {account.username[0].toUpperCase()}
                    </Avatar>
                    @{account.username}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Date Range Filter */}
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Time Range</InputLabel>
            <Select
              value={dateRange}
              label="Time Range"
              onChange={(e) => onDateRangeChange(e.target.value)}
            >
              <MenuItem value="7">Next 7 Days</MenuItem>
              <MenuItem value="30">Next 30 Days</MenuItem>
              <MenuItem value="90">Next 90 Days</MenuItem>
              <MenuItem value="all">All Posts</MenuItem>
            </Select>
          </FormControl>

          <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

          {/* Grid View Toggle */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <ToggleButtonGroup
              value={gridView}
              exclusive
              onChange={(_event, value: GridViewMode | null) => {
                if (value) onGridViewChange(value);
              }}
              size="small"
            >
              <ToggleButton value="all" aria-label="all media">
                <GridIcon sx={{ mr: 1 }} fontSize="small" />
                All media
              </ToggleButton>
              <ToggleButton value="reels" aria-label="reels view">
                <ReelIcon sx={{ mr: 1 }} fontSize="small" />
                Reels
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>

        {/* Right side - Post count */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {gridView === 'all' && (
            <FormControlLabel
              control={
                <Switch
                  checked={showCarousels}
                  onChange={(e) => onShowCarouselsChange(e.target.checked)}
                  size="small"
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <CarouselIcon fontSize="small" />
                  <Typography variant="body2">Carousels</Typography>
                </Box>
              }
            />
          )}
          <Chip
            label={`${filteredCount} of ${totalPosts} posts`}
            size="small"
            variant="outlined"
          />
        </Box>
      </Box>
    </Paper>
  );
};

export default GridFilters;
