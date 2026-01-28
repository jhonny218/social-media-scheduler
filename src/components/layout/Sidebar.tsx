import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Box,
  useTheme,
  useMediaQuery,
  Divider,
} from '@mui/material';
import {
  Dashboard as DashboardIcon,
  CalendarMonth as CalendarIcon,
  Analytics as AnalyticsIcon,
  PhotoLibrary as MediaIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';

const DRAWER_WIDTH = 240;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Scheduler', path: '/scheduler', icon: <CalendarIcon /> },
  { label: 'Analytics', path: '/analytics', icon: <AnalyticsIcon /> },
  { label: 'Media Library', path: '/media', icon: <MediaIcon /> },
  { label: 'Settings', path: '/settings', icon: <SettingsIcon /> },
];

const Sidebar: React.FC<SidebarProps> = ({ open, onClose }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      onClose();
    }
  };

  const drawerContent = (
    <Box sx={{ overflow: 'auto' }}>
      <Toolbar />

      {/* Create Post Button */}
      <Box sx={{ p: 2 }}>
        <ListItemButton
          onClick={() => handleNavigation('/scheduler?compose=true')}
          sx={{
            borderRadius: 2,
            background: 'linear-gradient(45deg, #405DE6, #833AB4, #C13584)',
            color: 'white',
            '&:hover': {
              background: 'linear-gradient(45deg, #3651c9, #722d9c, #a62d71)',
            },
          }}
        >
          <ListItemIcon sx={{ color: 'white', minWidth: 40 }}>
            <AddIcon />
          </ListItemIcon>
          <ListItemText
            primary="Create Post"
            primaryTypographyProps={{ fontWeight: 600 }}
          />
        </ListItemButton>
      </Box>

      <Divider sx={{ mx: 2 }} />

      {/* Navigation Items */}
      <List sx={{ px: 1 }}>
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;

          return (
            <ListItem key={item.path} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                onClick={() => handleNavigation(item.path)}
                sx={{
                  borderRadius: 2,
                  mx: 1,
                  backgroundColor: isActive ? 'action.selected' : 'transparent',
                  '&:hover': {
                    backgroundColor: isActive ? 'action.selected' : 'action.hover',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 40,
                    color: isActive ? 'primary.main' : 'text.secondary',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'primary.main' : 'text.primary',
                  }}
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );

  return (
    <>
      {/* Mobile drawer (temporary) */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={open}
          onClose={onClose}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      {/* Desktop drawer (permanent) */}
      {!isMobile && (
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              borderRight: '1px solid',
              borderColor: 'divider',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      )}
    </>
  );
};

export { DRAWER_WIDTH };
export default Sidebar;
