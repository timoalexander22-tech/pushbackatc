import { Link } from "@tanstack/react-router";
import { BookOpen, Gauge, GraduationCap, Headset, MoveDown, Settings, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useCrew } from "@/lib/crew/store";
import { PHASE_LABEL } from "@/lib/crew/engine";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/comms", label: "Funk", icon: Headset },
  { to: "/pushback", label: "Pushback", icon: MoveDown },
  { to: "/ground-ops", label: "Bodenbetrieb", icon: Truck },
  { to: "/tutorial", label: "Tutorial", icon: BookOpen },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/settings", label: "Einstellungen", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useCrew();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 px-2">
          <div className="font-display text-2xl font-bold uppercase leading-none text-primary">Virtual Ground Crew</div>
          <div className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">Pro · A320</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex h-12 items-center gap-3 rounded-xl px-3 text-base text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-xl border border-sidebar-border p-3 text-sm">
          <div className="text-muted-foreground">Status</div>
          <div className="font-display text-lg uppercase text-primary">{PHASE_LABEL[state.phase]}</div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 flex overflow-x-auto border-t border-sidebar-border bg-sidebar/95 px-1 pt-1 backdrop-blur md:hidden">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex min-w-[4.5rem] flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] text-muted-foreground data-[status=active]:text-primary"
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-4xl font-bold uppercase text-foreground md:text-5xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}
