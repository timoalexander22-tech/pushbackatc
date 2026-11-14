import { supabase } from "@/integrations/supabase/client";
import {
  isCompanionMessage,
  relayChannel,
  type AppCommand,
  type CompanionMessage,
} from "./protocol";

export type LinkHandlers = {
  onMessage: (m: CompanionMessage) => void;
  onError: (msg: string) => void;
};
export type Link = { send: (c: AppCommand) => void; close: () => void };

/** Direct WebSocket to the companion — works when the app runs on the simulator PC (localhost). */
export function openLocal(url: string, h: LinkHandlers): Link {
  let ws: WebSocket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (closed) return;
    try {
      ws = new WebSocket(url);
    } catch {
      h.onError("Ungültige Adresse. Beispiel: ws://localhost:8787");
      return;
    }
    ws.onmessage = (e) => {
      try {
        const m: unknown = JSON.parse(String(e.data));
        if (isCompanionMessage(m)) h.onMessage(m);
      } catch {
        // Ignore malformed frames; the next state frame follows within 250 ms.
      }
    };
    ws.onerror = () =>
      h.onError(
        location.protocol === "https:" && !/localhost|127\.0\.0\.1/.test(url)
          ? "Browser blockiert unverschlüsselte Netzwerkverbindungen. Auf dem iPad den Kopplungscode verwenden."
          : "Companion nicht erreichbar. Läuft es auf dem Windows-PC?",
      );
    ws.onclose = () => {
      if (!closed) retry = setTimeout(connect, 3000);
    };
  };
  connect();
  return {
    send: (c) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(c)),
    close: () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    },
  };
}

/** Internet relay via a pairing code — needed on iPad, where Safari blocks ws:// to the LAN from HTTPS. */
export function openRelay(code: string, h: LinkHandlers): Link {
  const channel = supabase.channel(relayChannel(code), { config: { broadcast: { self: false } } });
  channel
    .on("broadcast", { event: "msg" }, ({ payload }) => {
      if (isCompanionMessage(payload)) h.onMessage(payload);
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        h.onError("Relay-Verbindung fehlgeschlagen. Internetverbindung prüfen.");
    });
  return {
    send: (c) => void channel.send({ type: "broadcast", event: "cmd", payload: c }),
    close: () => void supabase.removeChannel(channel),
  };
}
