import { createServerFn } from "@tanstack/react-start";

const MAX = 8 * 1024 * 1024;

export const transcribeRadio = createServerFn({ method: "POST" })
  .validator((d: { audio: string; model?: string | undefined }) => {
    const audio = String(d.audio);
    if (!audio || audio.length > MAX * 1.4) throw new Error("Aufnahme zu groß oder leer.");
    const model = d.model?.trim();
    if (model && model.length > 128) throw new Error("Modellname ist zu lang.");
    return { audio, model: model || undefined };
  })
  .handler(async ({ data }) => {
    const provider = process.env["VGC_STT_PROVIDER"] ?? "openai";
    if (provider === "disabled") return { error: "Spracherkennung ist deaktiviert." };
    let baseUrl: string;
    let defaultModel: string;
    let defaultKey: string | undefined;
    switch (provider) {
      case "openai":
        baseUrl = "https://api.openai.com/v1";
        defaultModel = "gpt-4o-mini-transcribe";
        defaultKey = process.env["OPENAI_API_KEY"];
        break;
      case "groq":
        baseUrl = "https://api.groq.com/openai/v1";
        defaultModel = "whisper-large-v3-turbo";
        defaultKey = process.env["GROQ_API_KEY"];
        break;
      case "openai-compatible":
        baseUrl = process.env["VGC_STT_BASE_URL"] ?? "";
        defaultModel = "whisper-1";
        defaultKey = undefined;
        break;
      case "faster-whisper":
        baseUrl = process.env["VGC_STT_BASE_URL"] ?? "http://127.0.0.1:8788/v1";
        defaultModel = "base.en";
        defaultKey = undefined;
        break;
      default:
        return { error: `Unbekannter Spracherkennungsanbieter: ${provider}.` };
    }
    if (!baseUrl)
      return {
        error: "VGC_STT_BASE_URL für den OpenAI-kompatiblen Spracherkennungsanbieter fehlt.",
      };
    const key = process.env["VGC_STT_API_KEY"] ?? defaultKey;
    if (!key && provider !== "openai-compatible" && provider !== "faster-whisper")
      return { error: `${provider} ist nicht konfiguriert. API-Schlüssel serverseitig setzen.` };
    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const form = new FormData();
    form.append("model", data.model || process.env["VGC_STT_MODEL"] || defaultModel);
    form.append("file", new File([bin], "radio.wav", { type: "audio/wav" }), "radio.wav");
    form.append("response_format", "json");
    form.append("language", "en");
    form.append(
      "prompt",
      "Pilot talking to airport ground crew on headset: pushback, facing north/south/east/west, brakes released, parking brake set, starting engines one and two, ground power, chocks, doors.",
    );
    const headers: HeadersInit = key ? { Authorization: `Bearer ${key}` } : {};
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(
        provider === "openai-compatible" || provider === "faster-whisper" ? 180_000 : 60_000,
      ),
    });
    if (!res.ok) {
      if (res.status === 402)
        return { error: "Anbieter-Kontingent aufgebraucht oder Zahlung erforderlich." };
      if (res.status === 429) return { error: "Zu viele Anfragen – bitte kurz warten." };
      const t = await res.text();
      return { error: `Spracherkennung fehlgeschlagen (${res.status}): ${t.slice(0, 160)}` };
    }
    const j = (await res.json()) as { text?: string };
    return { text: (j.text ?? "").trim() };
  });
