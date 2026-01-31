import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Divider,
  FormControlLabel,
  Switch,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Avatar,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Person as ProfileIcon,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  Settings as PreferencesIcon,
} from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useAuth } from '../hooks/useAuth';
import AccountConnect from '../components/instagram/AccountConnect';
import FBPageConnect from '../components/facebook/FBPageConnect';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box
    role="tabpanel"
    hidden={value !== index}
    id={`settings-tabpanel-${index}`}
    aria-labelledby={`settings-tab-${index}`}
    sx={{ pt: 3 }}
  >
    {value === index && children}
  </Box>
);

interface ProfileFormData {
  displayName: string;
  email: string;
}

interface PreferencesFormData {
  timezone: string;
  emailNotifications: boolean;
  pushNotifications: boolean;
}

const Settings: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user, updateUserProfile, updateUserPreferences, loading: _loading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = searchParams.get('tab');
    return tabParam ? parseInt(tabParam, 10) : 0;
  });
  const [saving, setSaving] = useState(false);

  // Update URL when tab changes
  useEffect(() => {
    if (activeTab !== 0) {
      searchParams.set('tab', String(activeTab));
    } else {
      searchParams.delete('tab');
    }
    setSearchParams(searchParams, { replace: true });
  }, [activeTab, searchParams, setSearchParams]);

  // Profile form
  const {
    control: profileControl,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      displayName: user?.displayName || '',
      email: user?.email || '',
    },
  });

  // Preferences form
  const {
    control: prefsControl,
    handleSubmit: handlePrefsSubmit,
  } = useForm<PreferencesFormData>({
    defaultValues: {
      timezone: user?.preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      emailNotifications: user?.preferences?.notifications?.email ?? true,
      pushNotifications: user?.preferences?.notifications?.push ?? true,
    },
  });

  // Handle profile update
  const onProfileSubmit = async (data: ProfileFormData) => {
    setSaving(true);
    try {
      await updateUserProfile({ displayName: data.displayName });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // Handle preferences update
  const onPrefsSubmit = async (data: PreferencesFormData) => {
    setSaving(true);
    try {
      await updateUserPreferences({
        timezone: data.timezone,
        notifications: {
          email: data.emailNotifications,
          push: data.pushNotifications,
        },
      });
      toast.success('Preferences updated');
    } catch {
      toast.error('Failed to update preferences');
    } finally {
      setSaving(false);
    }
  };

  // Common timezones
  const timezones = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'America/Toronto',
    'Europe/London',
    'Europe/Paris',
    'Europe/Berlin',
    'Asia/Tokyo',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Australia/Sydney',
    'Pacific/Auckland',
  ];

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Settings
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
        Manage your account settings and preferences
      </Typography>

      <Paper sx={{ borderRadius: 2 }}>
        <Tabs
          value={activeTab}
          onChange={(_, newValue) => setActiveTab(newValue)}
          sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
        >
          <Tab icon={<ProfileIcon />} label="Profile" iconPosition="start" />
          <Tab icon={<InstagramIcon />} label="Instagram" iconPosition="start" />
          <Tab icon={<FacebookIcon />} label="Facebook" iconPosition="start" />
          <Tab icon={<PreferencesIcon />} label="Preferences" iconPosition="start" />
        </Tabs>

        <Box sx={{ p: 3 }}>
          {/* Profile Tab */}
          <TabPanel value={activeTab} index={0}>
            <Box component="form" onSubmit={handleProfileSubmit(onProfileSubmit)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 4 }}>
                <Avatar
                  src={user?.photoURL}
                  sx={{
                    width: 80,
                    height: 80,
                    fontSize: '1.5rem',
                    bgcolor: 'primary.main',
                  }}
                >
                  {user?.displayName ? getInitials(user.displayName) : '?'}
                </Avatar>
                <Box>
                  <Typography variant="h6">{user?.displayName}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {user?.email}
                  </Typography>
                </Box>
              </Box>

              <Controller
                name="displayName"
                control={profileControl}
                rules={{ required: 'Name is required' }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Display Name"
                    fullWidth
                    sx={{ mb: 3 }}
                    error={!!profileErrors.displayName}
                    helperText={profileErrors.displayName?.message}
                  />
                )}
              />

              <Controller
                name="email"
                control={profileControl}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Email"
                    fullWidth
                    disabled
                    sx={{ mb: 3 }}
                    helperText="Email cannot be changed"
                  />
                )}
              />

              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                sx={{ mt: 2 }}
              >
                {saving ? <CircularProgress size={24} /> : 'Save Changes'}
              </Button>
            </Box>
          </TabPanel>

          {/* Instagram Tab */}
          <TabPanel value={activeTab} index={1}>
            <AccountConnect />
          </TabPanel>

          {/* Facebook Tab */}
          <TabPanel value={activeTab} index={2}>
            <FBPageConnect />
          </TabPanel>

          {/* Preferences Tab */}
          <TabPanel value={activeTab} index={3}>
            <Box component="form" onSubmit={handlePrefsSubmit(onPrefsSubmit)}>
              <Typography variant="h6" gutterBottom>
                Time & Region
              </Typography>

              <Controller
                name="timezone"
                control={prefsControl}
                render={({ field }) => (
                  <FormControl fullWidth sx={{ mb: 4 }}>
                    <InputLabel>Timezone</InputLabel>
                    <Select {...field} label="Timezone">
                      {timezones.map((tz) => (
                        <MenuItem key={tz} value={tz}>
                          {tz.replace(/_/g, ' ')}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}
              />

              <Divider sx={{ my: 3 }} />

              <Typography variant="h6" gutterBottom>
                Notifications
              </Typography>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Controller
                  name="emailNotifications"
                  control={prefsControl}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label={
                        <Box>
                          <Typography>Email Notifications</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Receive updates about your scheduled posts via email
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />

                <Controller
                  name="pushNotifications"
                  control={prefsControl}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={(e) => field.onChange(e.target.checked)}
                        />
                      }
                      label={
                        <Box>
                          <Typography>Push Notifications</Typography>
                          <Typography variant="body2" color="text.secondary">
                            Receive browser notifications for post reminders
                          </Typography>
                        </Box>
                      }
                    />
                  )}
                />
              </Box>

              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                sx={{ mt: 4 }}
              >
                {saving ? <CircularProgress size={24} /> : 'Save Preferences'}
              </Button>
            </Box>
          </TabPanel>
        </Box>
      </Paper>
    </Box>
  );
};

export default Settings;
