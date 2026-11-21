import { createServerFn } from "@tanstack/react-start";
import { loopbackBaseUrl } from "../local-service";

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
    const provider = process.env["VGC_STT_PROVIDER"] ?? "faster-whisper";
    if (provider === "disabled") return { error: "Spracherkennung ist deaktiviert." };
    let defaultModel: string;
    switch (provider) {
      case "faster-whisper":
        defaultModel = "base.en";
        break;
      default:
        return { error: `Lokaler Spracherkennungsanbieter nicht unterstützt: ${provider}.` };
    }
    const baseUrl = loopbackBaseUrl(process.env["VGC_STT_BASE_URL"], "http://127.0.0.1:8788/v1");
    if (!baseUrl) return { error: "VGC_STT_BASE_URL muss auf einen lokalen HTTP-Dienst zeigen." };
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
    const res = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      const t = await res.text();
      return { error: `Spracherkennung fehlgeschlagen (${res.status}): ${t.slice(0, 160)}` };
    }
    const j = (await res.json()) as { text?: string };
    return { text: (j.text ?? "").trim() };
  });
