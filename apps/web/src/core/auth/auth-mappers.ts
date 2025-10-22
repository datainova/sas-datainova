import type { ApiRole, LoginOrganization, SessionResponse } from './auth-api';
import type {
  AuthUser,
  Entitlement,
  OrganizationMembership,
  UserPlan,
  UserRole
} from './auth.types';

const roleMap: Record<ApiRole, UserRole> = {
  ORG_OWNER: 'OWNER',
  MANAGER: 'MANAGER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  VIEWER: 'VIEWER',
  DATA_ADMIN: 'DATA_ADMIN'
};

const entitlementsByPlan: Record<UserPlan, Entitlement[]> = {
  FREE: ['OBJECTIVES', 'KRESULTS', 'KPIS'],
  PRO: [
    'OBJECTIVES',
    'KRESULTS',
    'KPIS',
    'CHECKINS',
    'ALERTS',
    'BILLING_UPGRADE',
    'BILLING_PORTAL',
    'INTEGRATIONS'
  ],
  ENTERPRISE: [
    'OBJECTIVES',
    'KRESULTS',
    'KPIS',
    'CHECKINS',
    'ALERTS',
    'BILLING_UPGRADE',
    'BILLING_PORTAL',
    'INTEGRATIONS',
    'AGENTS',
    'DASHBOARDS_ENTERPRISE'
  ]
};

export const mapApiRoleToUserRole = (role: ApiRole): UserRole => roleMap[role] ?? 'VIEWER';

export const mapOrganizations = (orgs: LoginOrganization[]): OrganizationMembership[] =>
  orgs.map((org) => ({
    id: org.id,
    name: org.name,
    role: mapApiRoleToUserRole(org.role),
    tenantId: org.tenantId ?? undefined,
    plan: org.plan ?? undefined
  }));

export const getEntitlementsForPlan = (plan: UserPlan): Entitlement[] => entitlementsByPlan[plan] ?? [];

export const resolveActiveOrganization = (
  organizations: OrganizationMembership[],
  preferredOrgId?: string | null
) => {
  if (!organizations.length) return undefined;
  if (preferredOrgId) {
    const found = organizations.find((org) => org.id === preferredOrgId);
    if (found) return found;
  }
  return organizations[0];
};

export const buildAuthUser = (params: {
  userId: string;
  email: string;
  status?: AuthUser['status'];
  accessToken: string | undefined;
  organization: OrganizationMembership;
  organizations: OrganizationMembership[];
}): AuthUser => {
  const activePlan: UserPlan = params.organization.plan ?? 'FREE';
  const roles = params.organization.role ? [params.organization.role] : [];
  const entitlements = getEntitlementsForPlan(activePlan);
  return {
    id: params.userId,
    name: params.email,
    email: params.email,
    role: params.organization.role,
    roles: roles.length > 0 ? roles : ['VIEWER'],
    plan: activePlan as UserPlan,
    entitlements,
    featureFlags: [],
    locale: 'pt-BR',
    orgId: params.organization.id,
    orgName: params.organization.name,
    tenantId: params.organization.tenantId ?? undefined,
    token: params.accessToken,
    status: params.status,
    organizations: params.organizations
  };
};

export const buildAuthUserFromSession = (params: {
  session: SessionResponse;
  accessToken: string;
  preferredOrgId?: string | null;
}) => {
  const organizations = mapOrganizations(params.session.orgs);
  const activeOrganization = resolveActiveOrganization(organizations, params.preferredOrgId ?? params.session.activeOrgId);
  if (!activeOrganization) {
    return null;
  }

  return buildAuthUser({
    userId: params.session.user.id,
    email: params.session.user.email,
    status: params.session.user.status,
    accessToken: params.accessToken,
    organization: activeOrganization,
    organizations
  });
};
