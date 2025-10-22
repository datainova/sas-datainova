import type { ReactNode } from 'react';
import { useAuth } from '../../core/auth/use-auth';
import type { UserRole } from '../../core/auth/auth.types';

type RoleGuardProps = {
  allow?: UserRole[];
  minimum?: UserRole;
  children: ReactNode;
  fallback?: ReactNode;
};

const roleRank: Record<UserRole, number> = {
  VIEWER: 1,
  CONTRIBUTOR: 2,
  MANAGER: 3,
  OWNER: 4,
  DATA_ADMIN: 4
};

const canAccessByMinimum = (userRole: UserRole, minimum: UserRole) =>
  roleRank[userRole] >= roleRank[minimum];

export const RoleGuard = ({ children, allow, minimum, fallback }: RoleGuardProps) => {
  const { user } = useAuth();

  if (!user) {
    return null;
  }

  const roles = user.roles?.length ? user.roles : [user.role];

  const allowed =
    allow && allow.length
      ? allow.some((role) => roles.includes(role))
      : true;
  const minimumSatisfied = minimum ? roles.some((role) => canAccessByMinimum(role, minimum)) : true;
  const hasAccess = allowed && minimumSatisfied;

  if (!hasAccess) {
    return (
      <>
        {fallback ?? (
          <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 text-sm text-slate-200">
            <p className="font-semibold text-white">Acesso restrito</p>
            <p className="mt-1 text-slate-400">Requer permissões adicionais para visualizar este conteúdo.</p>
          </div>
        )}
      </>
    );
  }

  return <>{children}</>;
};
