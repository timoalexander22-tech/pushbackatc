import { createServerFn } from "@tanstack/react-start";

const MAX = 8 * 1024 * 1024;

export const transcribeRadio = createServerFn({ method: "POST" })
  .inputValidator((d: { audio: string }) => {
    const audio = String(d.audio);
    if (!audio || audio.length > MAX * 1.4) throw new Error("Aufnahme zu groß oder leer.");
    return { audio };
  })
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { error: "Spracherkennung nicht konfiguriert." };
    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", "openai/gpt-transcribe");
    form.append("file", new File([bin], "radio.wav", { type: "audio/wav" }), "radio.wav");
    form.append("response_format", "json");
    form.append("languages", "en");
    form.append("prompt", "Pilot talking to airport ground crew on headset: pushback, facing north/south/east/west, brakes released, parking brake set, starting engines one and two, ground power, chocks, doors.");
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!res.ok) {
      if (res.status === 402) return { error: "KI-Guthaben aufgebraucht – bitte im Workspace aufladen." };
      if (res.status === 429) return { error: "Zu viele Anfragen – bitte kurz warten." };
      const t = await res.text();
      return { error: `Spracherkennung fehlgeschlagen (${res.status}): ${t.slice(0, 160)}` };
    }
    const j = (await res.json()) as { text?: string };
    return { text: (j.text ?? "").trim() };
  });
