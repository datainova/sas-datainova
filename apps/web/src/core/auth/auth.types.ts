export type UserRole = 'OWNER' | 'MANAGER' | 'CONTRIBUTOR' | 'VIEWER' | 'DATA_ADMIN';

export type UserPlan = 'FREE' | 'PRO' | 'ENTERPRISE';

export type Entitlement =
  | 'OBJECTIVES'
  | 'KRESULTS'
  | 'KPIS'
  | 'AGENTS'
  | 'CHECKINS'
  | 'ALERTS'
  | 'BILLING_PORTAL'
  | 'BILLING_UPGRADE'
  | 'INTEGRATIONS'
  | 'DASHBOARDS_ENTERPRISE';

export type UserStatus = 'ACTIVE' | 'BLOCKED';

export type OrganizationMembership = {
  id: string;
  name: string;
  role: UserRole;
  tenantId?: string | null;
  plan?: UserPlan | null;
};

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  plan: UserPlan;
  entitlements: Entitlement[];
  featureFlags: string[];
  locale: 'pt-BR' | 'en-US';
  orgId: string;
  tenantId?: string;
  token?: string;
  status?: UserStatus;
  orgName?: string;
  organizations?: OrganizationMembership[];
};
