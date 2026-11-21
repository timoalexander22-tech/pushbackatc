import { createServerFn } from "@tanstack/react-start";

export const crewSpeech = createServerFn({ method: "POST" })
  .validator(
    (d: {
      text: string;
      voice: string;
      accent: string;
      model?: string | undefined;
      localOnly?: boolean | undefined;
    }) => {
      const model = d.model?.trim();
      if (model && model.length > 128) throw new Error("Modellname ist zu lang.");
      return {
        text: String(d.text).slice(0, 400),
        voice: String(d.voice).slice(0, 30),
        accent: String(d.accent).slice(0, 30),
        model: model || undefined,
        localOnly: d.localOnly === true,
      };
    },
  )
  .handler(async ({ data }) => {
    const provider =
      process.env["VGC_TTS_PROVIDER"] ?? (data.localOnly ? "piper" : "openai");
    if (data.localOnly) {
      if (provider === "piper") {
        return synthesizePiper({
          baseUrl: process.env["VGC_TTS_BASE_URL"] ?? "http://127.0.0.1:5000",
          voice:
            data.model ||
            process.env["VGC_TTS_MODEL"] ||
            process.env["VGC_PIPER_VOICE"] ||
            "en_US-lessac-medium",
          text: data.text,
        });
      }
      if (provider !== "openai-compatible")
        return {
          error:
            "Lokale Crew-Stimme nicht konfiguriert. Setze VGC_TTS_PROVIDER=piper für Piper oder openai-compatible für einen kompatiblen TTS-Dienst.",
        };
      const baseUrl = process.env["VGC_TTS_BASE_URL"];
      if (!baseUrl) return { error: "VGC_TTS_BASE_URL für den lokalen TTS-Dienst fehlt." };
      return synthesize({
        baseUrl,
        key: process.env["VGC_TTS_API_KEY"],
        model: data.model || process.env["VGC_TTS_MODEL"] || "",
        voice: process.env["VGC_TTS_VOICE"] || "default",
        text: data.text,
      });
    }
    if (provider === "disabled") return { error: "Online-Stimmen sind deaktiviert." };
    if (provider !== "openai" && provider !== "openai-compatible")
      return { error: `Unbekannter Sprachsyntheseanbieter: ${provider}.` };
    const baseUrl =
      provider === "openai" ? "https://api.openai.com/v1" : process.env["VGC_TTS_BASE_URL"];
    if (!baseUrl)
      return { error: "VGC_TTS_BASE_URL für den OpenAI-kompatiblen Sprachsyntheseanbieter fehlt." };
    const key = process.env["VGC_TTS_API_KEY"] ?? process.env["OPENAI_API_KEY"];
    if (!key && provider === "openai")
      return {
        error: "OpenAI-Sprachausgabe nicht konfiguriert. API-Schlüssel serverseitig setzen.",
      };
    const knownOpenAiVoices = new Set(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
    const voice =
      process.env["VGC_TTS_VOICE"] ??
      (provider === "openai"
        ? knownOpenAiVoices.has(data.voice)
          ? data.voice
          : "alloy"
        : data.voice);
    return synthesize({
      baseUrl,
      key,
      model: data.model || process.env["VGC_TTS_MODEL"] || "tts-1",
      voice,
      text: data.text,
    });
  });

async function synthesizePiper({
  baseUrl,
  voice,
  text,
}: {
  baseUrl: string;
  voice: string;
  text: string;
}) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl.replace(/\/+$/, "")}/synthesize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { error: "Lokaler Piper-Dienst läuft nicht auf 127.0.0.1:5000." };
  }
  if (!res.ok) return { error: `Piper-Sprachausgabe fehlgeschlagen (${res.status}).` };
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { audio: btoa(bin), type: "audio/wav" };
}

async function synthesize({
  baseUrl,
  key,
  model,
  voice,
  text,
}: {
  baseUrl: string;
  key: string | undefined;
  model: string;
  voice: string;
  text: string;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, input: text, voice, response_format: "mp3" }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const msg =
      res.status === 402
        ? "Anbieter-Kontingent aufgebraucht oder Zahlung erforderlich."
        : res.status === 429
          ? "Zu viele Anfragen, kurz warten."
          : `Stimme nicht verfügbar (${res.status}).`;
    return { error: msg };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000)
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { audio: btoa(bin), type: res.headers.get("content-type") || "audio/mpeg" };
}
