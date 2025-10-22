import { Suspense, lazy, type ReactNode } from 'react';
import { Navigate, useRoutes } from 'react-router-dom';
import { AuthGuard } from './guards/AuthGuard';
import { PlanGuard } from './guards/PlanGuard';
import { RoleGuard } from './guards/RoleGuard';

const DashboardHome = lazy(() => import('../modules/dashboards/pages/DashboardHome'));
const OnboardingWizardPage = lazy(() => import('../modules/onboarding/pages/OnboardingWizardPage'));
const ObjectivesListPage = lazy(() => import('../modules/objectives/pages/ObjectivesListPage'));
const ObjectiveWizardPage = lazy(() => import('../modules/objectives/wizard/ObjectiveWizardPage'));
const ObjectiveDetailPage = lazy(() => import('../modules/objectives/pages/ObjectiveDetailPage'));
const KrWizardPage = lazy(() => import('../modules/kresults/wizard/KrWizardPage'));
const KrDetailPage = lazy(() => import('../modules/kresults/pages/KrDetailPage'));
const KpiListPage = lazy(() => import('../modules/kpis/pages/KpiListPage'));
const KpiWizardPage = lazy(() => import('../modules/kpis/wizard/KpiWizardPage'));
const AlertsPage = lazy(() => import('../modules/alerts/pages/AlertsPage'));
const CheckinsPage = lazy(() => import('../modules/checkins/pages/CheckinsPage'));
const AgentsAdminPage = lazy(() => import('../modules/agents/pages/AgentsAdminPage'));
const PlansPage = lazy(() => import('../modules/billing/pages/PlansPage'));
const CheckoutSuccessPage = lazy(() => import('../modules/billing/pages/CheckoutSuccessPage'));
const CheckoutCancelPage = lazy(() => import('../modules/billing/pages/CheckoutCancelPage'));
const ProfileSettingsPage = lazy(() => import('../modules/settings/pages/ProfileSettingsPage'));
const OrgSettingsPage = lazy(() => import('../modules/settings/pages/OrgSettingsPage'));
const IntegrationsSettingsPage = lazy(() => import('../modules/settings/pages/IntegrationsSettingsPage'));
const LoginPage = lazy(() => import('../modules/auth/pages/LoginPage'));
const SignupRequestPage = lazy(() => import('../modules/auth/pages/SignupRequestPage'));
const SignupCompletePage = lazy(() => import('../modules/auth/pages/SignupCompletePage'));
const PasswordForgotPage = lazy(() => import('../modules/auth/pages/PasswordForgotPage'));
const PasswordResetPage = lazy(() => import('../modules/auth/pages/PasswordResetPage'));
const NotFoundPage = lazy(() => import('../modules/not-found/NotFoundPage'));
const AppShell = lazy(() => import('../modules/app-shell/AppShell'));

export const AppRouter = () => {
  const element = useRoutes([
    {
      path: '/login',
      element: withSuspense(<LoginPage />)
    },
    {
      path: '/signup',
      element: withSuspense(<SignupRequestPage />)
    },
    {
      path: '/signup/complete',
      element: withSuspense(<SignupCompletePage />)
    },
    {
      path: '/password/forgot',
      element: withSuspense(<PasswordForgotPage />)
    },
    {
      path: '/password/reset',
      element: withSuspense(<PasswordResetPage />)
    },
    {
      path: '/onboarding',
      element: withSuspense(<OnboardingWizardPage />)
    },
    {
      path: '/',
      element: (
        <AuthGuard>
          {withSuspense(
            <AppShell />
          )}
        </AuthGuard>
      ),
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        {
          path: 'dashboard',
          element: withSuspense(<DashboardHome />)
        },
        {
          path: 'objectives',
          children: [
            { index: true, element: withSuspense(<ObjectivesListPage />) },
            {
              path: 'new',
              element: withSuspense(
                <RoleGuard minimum="MANAGER">
                  <ObjectiveWizardPage />
                </RoleGuard>
              )
            },
            {
              path: ':objectiveId',
              element: withSuspense(<ObjectiveDetailPage />)
            },
            {
              path: ':objectiveId/kresults/new',
              element: withSuspense(
                <RoleGuard minimum="MANAGER">
                  <PlanGuard required="KRESULTS">
                    <KrWizardPage />
                  </PlanGuard>
                </RoleGuard>
              )
            }
          ]
        },
        {
          path: 'kresults/:kresultId',
          element: withSuspense(<KrDetailPage />)
        },
        {
          path: 'kpis',
          children: [
            { index: true, element: withSuspense(<KpiListPage />) },
            {
              path: 'new',
              element: withSuspense(
                <RoleGuard minimum="MANAGER">
                  <PlanGuard required="KPIS">
                    <KpiWizardPage />
                  </PlanGuard>
                </RoleGuard>
              )
            }
          ]
        },
        {
          path: 'alerts',
          element: withSuspense(<AlertsPage />)
        },
        {
          path: 'checkins',
          element: withSuspense(
            <RoleGuard minimum="CONTRIBUTOR">
              <CheckinsPage />
            </RoleGuard>
          )
        },
        {
          path: 'agents',
          element: withSuspense(
            <PlanGuard required="AGENTS">
              <AgentsAdminPage />
            </PlanGuard>
          )
        },
        {
          path: 'billing',
          children: [
            {
              path: 'plans',
              element: withSuspense(
                <PlanGuard required={['BILLING_PORTAL', 'BILLING_UPGRADE']}>
                  <PlansPage />
                </PlanGuard>
              )
            },
            {
              path: 'checkout/success',
              element: withSuspense(<CheckoutSuccessPage />)
            },
            {
              path: 'checkout/cancel',
              element: withSuspense(<CheckoutCancelPage />)
            }
          ]
        },
        {
          path: 'settings',
          children: [
            {
              path: 'profile',
              element: withSuspense(<ProfileSettingsPage />)
            },
            {
              path: 'org',
              element: withSuspense(
                <RoleGuard minimum="OWNER">
                  <OrgSettingsPage />
                </RoleGuard>
              )
            },
            {
              path: 'integrations',
              element: withSuspense(
                <PlanGuard required="INTEGRATIONS">
                  <IntegrationsSettingsPage />
                </PlanGuard>
              )
            }
          ]
        },
        {
          path: '*',
          element: withSuspense(<NotFoundPage />)
        }
      ]
    }
  ]);

  return element;
};

const withSuspense = (node: ReactNode) => (
  <Suspense fallback={<FullPageSpinner />}>{node}</Suspense>
);

const FullPageSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-muted text-[color:var(--color-fg)] dark:bg-[rgba(18,18,18,0.85)] dark:text-[rgba(230,224,220,0.75)]">
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      <span className="text-sm font-medium uppercase tracking-[0.2em] text-[rgba(45,41,38,0.55)] dark:text-[rgba(230,224,220,0.6)]">
        Carregando
      </span>
    </div>
  </div>
);

export default AppRouter;
