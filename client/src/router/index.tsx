import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AuthLayout } from '../components/layout/AuthLayout';
import { AdminLayout } from '../components/layout/AdminLayout';
import { UserLayout } from '../components/layout/UserLayout';
import { GuestLayout } from '../components/layout/GuestLayout';
import { WelcomePage } from '../pages/welcome/WelcomePage';
import { LoginPage } from '../pages/auth/LoginPage';
import { AdminLoginPage } from '../pages/auth/AdminLoginPage';
import { AdminAuthLayout } from '../components/layout/AdminAuthLayout';
import { AdminDashboard } from '../pages/admin/AdminDashboard';
import { SubjectCreatePage } from '../pages/admin/SubjectCreatePage';
import { BookCreatePage } from '../pages/admin/BookCreatePage';
import { ChapterCreatePage } from '../pages/admin/ChapterCreatePage';
import { ContentCreatePage } from '../pages/admin/ContentCreatePage';
import { SubjectImportPage } from '../pages/admin/SubjectImportPage';
import { RoadmapCanonicalCreatePage } from '../pages/admin/RoadmapCanonicalCreatePage';
import { RoadmapCanonicalViewPage } from '../pages/admin/RoadmapCanonicalViewPage';
import { UserDashboard } from '../pages/user/UserDashboard';
import { SubjectSelectPage } from '../pages/user/SubjectSelectPage';
import { BookSelectPage } from '../pages/user/BookSelectPage';
import { TestStartPage } from '../pages/user/TestStartPage';
import { TestPage } from '../pages/user/TestPage';
import { TestResultPage } from '../pages/user/TestResultPage';
import { TestHistoryDetailPage } from '../pages/user/TestHistoryDetailPage';
import { KnowledgeMapPage } from '../pages/user/KnowledgeMapPage';
import { GuestTestResultPage } from '../pages/guest/GuestTestResultPage';
import { PrivateRoute } from './PrivateRoute';
import { useAuth } from '../store/auth.store';

const RootRedirect: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <div className="container-page">Загрузка...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/welcome" replace />;
  }

  if (user?.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }

  return <Navigate to="/user" replace />;
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootRedirect />
  },
  {
    path: '/welcome',
    element: <WelcomePage />
  },
  {
    element: <AuthLayout />,
    children: [
      { path: '/login', element: <LoginPage /> }
    ]
  },
  {
    element: <AdminAuthLayout />,
    children: [{ path: '/admin/login', element: <AdminLoginPage /> }]
  },
  {
    element: <GuestLayout />,
    children: [
      { path: '/guest/subjects', element: <SubjectSelectPage /> },
      { path: '/guest/books', element: <BookSelectPage /> },
      { path: '/guest/test/start', element: <TestStartPage /> },
      { path: '/guest/test', element: <TestPage /> },
      { path: '/guest/test/result', element: <GuestTestResultPage /> }
    ]
  },
  {
    element: <PrivateRoute roles={['admin']} />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { path: '/admin', element: <AdminDashboard /> },
          { path: '/admin/subjects/import', element: <SubjectImportPage /> },
          { path: '/admin/subjects/new', element: <SubjectCreatePage /> },
          { path: '/admin/books/new', element: <BookCreatePage /> },
          { path: '/admin/chapters/new', element: <ChapterCreatePage /> },
          { path: '/admin/contents/new', element: <ContentCreatePage /> },
          { path: '/admin/roadmaps/create', element: <RoadmapCanonicalCreatePage /> },
          { path: '/admin/roadmaps/:subjectId', element: <RoadmapCanonicalViewPage /> }
        ]
      }
    ]
  },
  {
    element: <PrivateRoute roles={['user']} />,
    children: [
      {
        element: <UserLayout />,
        children: [
          { path: '/user', element: <UserDashboard /> },
          { path: '/user/roadmap', element: <KnowledgeMapPage /> },
          { path: '/user/subjects', element: <SubjectSelectPage /> },
          { path: '/user/books', element: <BookSelectPage /> },
          { path: '/user/test/start', element: <TestStartPage /> },
          { path: '/user/test', element: <TestPage /> },
          { path: '/user/test/result', element: <TestResultPage /> },
          { path: '/user/tests/:testHistoryId', element: <TestHistoryDetailPage /> }
        ]
      }
    ]
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
]);
