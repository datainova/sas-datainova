import type { ReactNode } from 'react';
import { useAuth } from '../../core/auth/use-auth';
import type { Entitlement } from '../../core/auth/auth.types';

type PlanGuardProps = {
  required: Entitlement | Entitlement[];
  children: ReactNode;
  fallback?: ReactNode;
};

const defaultFallback = (
  <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-8 text-sm text-amber-100">
    <p className="font-semibold">Funcionalidade disponível em planos superiores</p>
    <p className="mt-1 text-amber-200/80">Fale com seu administrador ou atualize o plano para continuar.</p>
  </div>
);

export const PlanGuard = ({ children, required, fallback }: PlanGuardProps) => {
  const { user } = useAuth();
  const requiredEntitlements = Array.isArray(required) ? required : [required];

  if (!user) {
    return null;
  }

  const hasAccess = requiredEntitlements.every((entitlement) => user.entitlements.includes(entitlement));

  if (!hasAccess) {
    return <>{fallback ?? defaultFallback}</>;
  }

  return <>{children}</>;
};
