import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader } from '../components/ui/Loader';
import { UserRole } from '../types/auth.types';
import { useAuth } from '../store/auth.store';

export interface PrivateRouteProps {
  roles?: UserRole[];
}

export const PrivateRoute: React.FC<PrivateRouteProps> = ({ roles }) => {
  const location = useLocation();
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <Loader />;
  }

  if (!isAuthenticated) {
    return (
      <Navigate
        to="/welcome"
        replace
        state={{ returnUrl: location.pathname + location.search }}
      />
    );
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
};
