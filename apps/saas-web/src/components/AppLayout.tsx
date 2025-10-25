import React, { useMemo } from "react";
import { LayoutDashboard, Target, CalendarRange, Users, Settings, LogOut, BadgeCheck, Layers } from "lucide-react";
import { useAuthSession } from "../hooks/useAuthSession";

export function AppLayout({ title, children }: { title?: string; children: React.ReactNode }) {
  const { session, clearSession } = useAuthSession();
  const email = session?.user.email ?? "";
  const name = session?.user.name ?? undefined;
  const org = session?.organization?.name ?? "";
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";

  const items = useMemo(
    () => [
      { href: "/app", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
      { href: "/wizard/objectives", label: "Wizard", icon: <Target className="h-4 w-4" /> },
      { href: "/manage/periods", label: "Períodos", icon: <CalendarRange className="h-4 w-4" /> },
      { href: "/manage/objectives", label: "Objetivos", icon: <Layers className="h-4 w-4" /> },
      { href: "/manage/indicators", label: "Indicadores", icon: <BadgeCheck className="h-4 w-4" /> },
      { href: "/manage/members", label: "Membros", icon: <Users className="h-4 w-4" /> },
      { href: "/manage/settings", label: "Configurações", icon: <Settings className="h-4 w-4" /> },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-[#0b0b0b] text-white">
      <div className="mx-auto grid max-w-7xl grid-cols-1 md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-white/10 bg-[#0e0e0e] md:block">
          <div className="flex h-14 items-center justify-between px-4">
            <a href="/app" className="text-sm font-semibold">DataInova Connect</a>
          </div>
          <nav className="px-2 py-2">
            {items.map((item) => {
              const active = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "/app");
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm transition ${
                    active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
          <div className="mt-auto hidden px-3 pb-4 md:block">
            <div className="rounded-md border border-white/10 bg-white/5 p-3 text-xs text-white/70">
              <div className="font-medium text-white">{name ?? email}</div>
              <div className="truncate">{org}</div>
              <button
                onClick={() => {
                  clearSession();
                  window.location.replace("/");
                }}
                className="mt-2 inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[11px] text-white/80 hover:border-white/40"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </div>
          </div>
        </aside>

        <div>
          <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0e0e0e]/90 backdrop-blur supports-[backdrop-filter]:bg-[#0e0e0e]/70">
            <div className="flex h-14 items-center justify-between px-4">
              <div className="text-sm font-semibold">{title ?? ""}</div>
              <div className="flex items-center gap-3 text-xs text-white/70">
                <span className="hidden sm:inline">{org}</span>
                <span className="truncate">{name ?? email}</span>
              </div>
            </div>
          </header>
          <main className="px-4 py-6 md:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export default AppLayout;

