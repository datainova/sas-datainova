import { Fragment } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../core/auth/use-auth';
import { useTheme } from '../../core/theme/theme-provider';
import clsx from 'clsx';
import { Button } from '../../design-system/components/Button';
import { Badge } from '../../design-system/components/Badge';
import { BrandMark } from '../../logo/BrandMark';

const navigationItems = [
  { to: '/dashboard', translationKey: 'navigation.home' },
  { to: '/objectives', translationKey: 'navigation.objectives' },
  { to: '/objectives/new', translationKey: 'navigation.objectiveWizard' },
  { to: '/kpis', translationKey: 'navigation.kpis' },
  { to: '/alerts', translationKey: 'navigation.alerts' },
  { to: '/checkins', translationKey: 'navigation.checkins' },
  { to: '/billing/plans', translationKey: 'navigation.billing' }
] as const;

const AppShell = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-[color:var(--color-bg)] text-[color:var(--color-fg)] transition-colors duration-200">
      <aside className="hidden w-72 flex-col border-r border-border/80 bg-muted/80 px-8 py-10 backdrop-blur lg:flex dark:border-[rgba(230,224,220,0.24)] dark:bg-[rgba(18,18,18,0.7)]">
        <div className="flex items-center gap-3">
          <BrandMark className="h-10" />
          <span className="sr-only">{t('common.brand')}</span>
        </div>
        <p className="mt-6 text-xs uppercase tracking-[0.28em] text-[rgba(45,41,38,0.55)] dark:text-[rgba(230,224,220,0.55)]">
          Estratégia & Execução
        </p>
        <nav className="mt-8 space-y-1 text-sm">
          {navigationItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center justify-between rounded-xl border border-transparent px-4 py-2 font-medium transition duration-200 ease-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#121212]',
                  isActive
                    ? 'border-brand bg-brand text-brand-foreground shadow-soft'
                    : 'text-[rgba(45,41,38,0.65)] hover:border-brand/30 hover:bg-brand/10 hover:text-brand dark:text-[rgba(230,224,220,0.7)] dark:hover:text-brand-foreground dark:hover:bg-brand-foreground/15'
                )
              }
            >
              {t(item.translationKey)}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-white/90 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-white/70 dark:border-[rgba(230,224,220,0.2)] dark:bg-[rgba(18,18,18,0.85)]">
          <div className="flex items-center gap-3 lg:hidden">
            <BrandMark className="h-9" />
            <span className="sr-only">{t('common.brand')}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-[rgba(45,41,38,0.7)] dark:text-[rgba(230,224,220,0.75)]">
            {user ? (
              <Fragment>
                <span>{user.name}</span>
                <Badge tone="muted">{user.plan}</Badge>
              </Fragment>
            ) : null}
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              {theme === 'dark' ? '🌙' : '☀️'}
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-muted/40">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppShell;
