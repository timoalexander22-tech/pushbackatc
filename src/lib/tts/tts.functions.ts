import { createServerFn } from "@tanstack/react-start";
import { loopbackBaseUrl } from "../local-service";

export const crewSpeech = createServerFn({ method: "POST" })
  .validator((d: { text: string; voice: string; accent: string; model?: string | undefined }) => {
    const model = d.model?.trim();
    if (model && model.length > 128) throw new Error("Modellname ist zu lang.");
    return {
      text: String(d.text).slice(0, 400),
      voice: String(d.voice).slice(0, 30),
      accent: String(d.accent).slice(0, 30),
      model: model || undefined,
    };
  })
  .handler(async ({ data }) => {
    const provider = process.env["VGC_TTS_PROVIDER"] ?? "piper";
    if (provider === "disabled") return { error: "Sprachausgabe ist deaktiviert." };
    if (provider === "piper") {
      const baseUrl = loopbackBaseUrl(process.env["VGC_TTS_BASE_URL"], "http://127.0.0.1:5000");
      if (!baseUrl) return { error: "VGC_TTS_BASE_URL muss auf einen lokalen HTTP-Dienst zeigen." };
      return synthesizePiper({
        baseUrl,
        voice:
          data.model ||
          process.env["VGC_TTS_MODEL"] ||
          process.env["VGC_PIPER_VOICE"] ||
          "en_US-lessac-medium",
        text: data.text,
      });
    }
    return { error: `Lokaler TTS-Anbieter nicht unterstützt: ${provider}.` };
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
