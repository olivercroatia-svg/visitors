import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';

function FullScreenLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/prijava" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function AdminRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/prijava" replace />;
  if (user.platform_role !== 'admin') return <Navigate to="/" replace />;
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
  return <Outlet />;
}
