import { Mic, MicOff, Send, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/lib/crew/engine";
import { speak, useRecognition } from "@/lib/speech";
import { cn } from "@/lib/utils";
import { useSettings } from "@/lib/settings";
import { keyLabel, usePushToTalk } from "@/lib/ptt";

export function RadioLog({ log, empty }: { log: Message[]; empty?: string | undefined }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [log.length]);
  return (
    <div className="panel flex h-[46dvh] min-h-72 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
      {log.length === 0 && <p className="m-auto max-w-sm text-center text-muted-foreground">{empty ?? "Noch kein Funkverkehr."}</p>}
      {log.map((m) => (
        <div key={m.id} className={cn("flex max-w-[85%] flex-col", m.from === "pilot" ? "self-end items-end" : "self-start")}>
          <span className="font-display text-xs uppercase tracking-widest text-muted-foreground">
            {m.from === "pilot" ? "Cockpit" : m.from === "crew" ? "Ground" : "Hinweis"}
          </span>
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 font-mono text-[15px] leading-snug",
              m.from === "pilot" && "rounded-br-sm bg-primary text-primary-foreground",
              m.from === "crew" && "rounded-bl-sm border border-border bg-secondary text-secondary-foreground",
              m.from === "system" && "border border-accent/40 bg-accent/10 font-sans text-foreground",
            )}
          >
            {m.text}
            {m.from === "crew" && (
              <button onClick={() => speak(m.text)} className="ml-2 inline-flex align-middle text-muted-foreground hover:text-primary" aria-label="Erneut abspielen">
                <Volume2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

export function CommandInput({ onSend, suggestions }: { onSend: (t: string) => void; suggestions?: string[] | undefined }) {
  const [text, setText] = useState("");
  const rec = useRecognition((t) => onSend(t));
  const { settings } = useSettings();
  const ptt = usePushToTalk(settings.pttKeys, rec.start, rec.stop, rec.cancel);
  const submit = () => {
    if (!text.trim()) return;
    onSend(text);
    setText("");
  };
  return (
    <div className="space-y-3">
      {suggestions && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <Button key={s} variant="panel" size="touch" className="font-mono text-sm" onClick={() => onSend(s)}>
              {s}
            </Button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="xl"
          variant={rec.listening ? "destructive" : "panel"}
          className={cn("w-14 shrink-0 touch-none select-none px-0", rec.listening && "animate-pulse-ring")}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            ptt.press(`pointer:${e.pointerId}`);
          }}
          onPointerUp={(e) => ptt.release(`pointer:${e.pointerId}`)}
          onPointerCancel={(e) => ptt.release(`pointer:${e.pointerId}`)}
          onLostPointerCapture={(e) => ptt.release(`pointer:${e.pointerId}`)}
          onKeyDown={(e) => {
            if ((e.code === "Space" || e.code === "Enter") && !e.repeat) {
              e.preventDefault();
              ptt.press(`button:${e.code}`);
            }
          }}
          onKeyUp={(e) => ptt.release(`button:${e.code}`)}
          onBlur={() => { ptt.release("button:Space"); ptt.release("button:Enter"); }}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!rec.supported}
          aria-label="Sprechtaste"
          aria-pressed={ptt.pressed}
          title={rec.supported ? `Push-to-Talk · ${settings.pttKeys.map(keyLabel).join(" / ")}` : "Spracheingabe wird von diesem Browser nicht unterstützt"}
        >
          {rec.listening ? <Mic className="!size-6" /> : <MicOff className="!size-6" />}
        </Button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Type command in English…"
          autoCapitalize="sentences"
          className="h-14 min-w-0 flex-1 rounded-xl border border-input bg-background/60 px-4 font-mono text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <Button size="xl" variant="cockpit" onClick={submit} aria-label="Senden">
          <Send className="!size-5" />
        </Button>
      </div>
      {!rec.supported && <p className="text-sm text-muted-foreground">Spracheingabe ist in diesem Browser nicht verfügbar – bitte Texteingabe nutzen.</p>}
      {rec.busy && <p className="text-sm text-muted-foreground">Funkspruch wird erkannt…</p>}
      {rec.error && <p className="text-sm text-destructive">{rec.error}</p>}
    </div>
  );
}
