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
    const returnPath = location.pathname + location.search;
    const adminOnly = !!roles?.length && roles.every((r) => r === 'admin' || r === 'teacher');
    if (adminOnly) {
      return (
        <Navigate
          to={`/admin/login?returnUrl=${encodeURIComponent(returnPath)}`}
          replace
        />
      );
    }
    return (
      <Navigate
        to="/welcome"
        replace
        state={{ returnUrl: returnPath }}
      />
    );
  }

  if (roles && user && !roles.includes(user.role)) {
    return <Navigate to={user.role === 'user' ? '/user' : '/admin'} replace />;
  }

  return <Outlet />;
};
