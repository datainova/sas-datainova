import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import clsx from 'clsx';

type NavItem = {
  path: string;
  label: string;
};

type LayoutShellProps = {
  navigation: NavItem[];
  cta?: ReactNode;
  children: ReactNode;
};

export const LayoutShell = ({ navigation, cta, children }: LayoutShellProps) => {
  const location = useLocation();

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900/40 p-6 lg:flex">
        <div className="mb-6 flex items-center gap-2">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-500 text-lg font-bold">
            DI
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-300">DataInova</p>
            <p className="text-xs text-slate-500">Objetivos estratégicos</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {navigation.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === item.path ? 'bg-brand-500/10 text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        {cta && <div className="mt-6">{cta}</div>}
      </aside>
      <main className="flex-1">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-6 py-4 shadow-sm">
          <div>
            <h1 className="text-lg font-semibold text-white">DataInova</h1>
            <p className="text-sm text-slate-400">Gestão de objetivos estratégicos equipiais</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-brand-500/20" />
            <div>
              <p className="text-sm font-medium text-white">Thiago Souza</p>
              <p className="text-xs text-slate-500">ORG_OWNER</p>
            </div>
          </div>
        </header>
        <section className="p-6">{children}</section>
      </main>
    </div>
  );
};
