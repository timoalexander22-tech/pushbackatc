import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { applyUpdate, useUpdateCheck } from "@/lib/updates";

/** One toast per newly detected build, never mid-flight interruptions beyond that. */
export function UpdateNotifier() {
  const { available, latest } = useUpdateCheck();
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!available || !latest || shown.current === latest.version) return;
    shown.current = latest.version;
    toast("Update verfügbar", {
      description: `Version ${latest.version} ist bereit.`,
      duration: 15000,
      action: { label: "Aktualisieren", onClick: () => void applyUpdate() },
    });
  }, [available, latest]);
  return null;
}
