import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../core/auth/use-auth';

type AuthGuardProps = {
  children: ReactNode;
  fallback?: ReactNode;
};

export const AuthGuard = ({ children, fallback }: AuthGuardProps) => {
  const location = useLocation();
  const { isAuthenticated, isBootstrapping } = useAuth();

  if (isBootstrapping) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted text-[color:var(--color-fg)] dark:bg-[rgba(18,18,18,0.9)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-sm font-medium uppercase tracking-[0.2em] text-[rgba(45,41,38,0.55)] dark:text-[rgba(230,224,220,0.6)]">
            Verificando sessão
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
