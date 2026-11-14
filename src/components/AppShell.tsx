import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  Download,
  Gauge,
  GraduationCap,
  Headset,
  MoveDown,
  Settings,
  Truck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCrew } from "@/lib/crew/store";
import { PHASE_LABEL } from "@/lib/crew/engine";
import { SIM_STATUS_LABEL, useSim } from "@/lib/sim/store";
import { useUpdateCheck } from "@/lib/updates";
import { cn } from "@/lib/utils";
import { UpdateNotifier } from "./UpdateNotifier";

const NAV = [
  { to: "/", label: "Dashboard", icon: Gauge },
  { to: "/comms", label: "Funk", icon: Headset },
  { to: "/pushback", label: "Pushback", icon: MoveDown },
  { to: "/ground-ops", label: "Bodenbetrieb", icon: Truck },
  { to: "/tutorial", label: "Tutorial", icon: BookOpen },
  { to: "/training", label: "Training", icon: GraduationCap },
  { to: "/settings", label: "Einstellungen", icon: Settings },
  { to: "/updates", label: "Updates", icon: Download },
] as const;

function UpdateDot({ show }: { show: boolean }) {
  if (!show) return null;
  return <span className="ml-auto size-2.5 rounded-full bg-primary" aria-hidden="true" />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { state } = useCrew();
  const sim = useSim();
  const { available } = useUpdateCheck();
  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="mb-8 px-2">
          <div className="font-display text-2xl font-bold uppercase leading-none text-primary">
            Virtual Ground Crew
          </div>
          <div className="font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">
            Pro · A320
          </div>
        </div>
        <nav className="flex flex-col gap-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="flex h-12 shrink-0 items-center gap-3 rounded-xl px-3 text-base text-sidebar-foreground transition-colors hover:bg-sidebar-accent data-[status=active]:bg-sidebar-accent data-[status=active]:text-primary"
            >
              <Icon className="size-5" /> {label}
              <UpdateDot show={to === "/updates" && available} />
              {to === "/updates" && available && (
                <span className="sr-only">(Update verfügbar)</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 rounded-xl border border-sidebar-border p-3 text-sm">
          <div>
            <div className="text-muted-foreground">Status</div>
            <div className="font-display text-lg uppercase text-primary">
              {PHASE_LABEL[state.phase]}
            </div>
          </div>
          <Link
            to="/settings"
            hash="simulator"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                sim.status === "live"
                  ? "bg-emerald-400"
                  : sim.status === "off"
                    ? "bg-muted-foreground/50"
                    : "bg-primary",
              )}
              aria-hidden="true"
            />
            {SIM_STATUS_LABEL[sim.status]}
          </Link>
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
            className="relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-0.5 rounded-lg py-2 text-[11px] text-muted-foreground data-[status=active]:text-primary"
          >
            <Icon className="size-5" />
            {label}
            {to === "/updates" && available && (
              <span
                className="absolute right-4 top-1.5 size-2 rounded-full bg-primary"
                aria-label="Update verfügbar"
              />
            )}
          </Link>
        ))}
      </nav>
      <UpdateNotifier />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
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
