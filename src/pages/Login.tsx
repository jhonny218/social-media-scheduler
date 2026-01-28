import React from 'react';
import { Box, Container } from '@mui/material';
import { Navigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { useAuth } from '../hooks/useAuth';

const Login: React.FC = () => {
  const { user, loading } = useAuth();

  // Redirect to dashboard if already logged in
  if (user && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Box
          sx={{
            backgroundColor: 'white',
            borderRadius: 3,
            boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
            p: { xs: 3, sm: 5 },
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <LoginForm />
        </Box>
      </Container>
    </Box>
  );
};

export default Login;
