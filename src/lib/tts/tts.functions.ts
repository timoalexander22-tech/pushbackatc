import { createServerFn } from "@tanstack/react-start";

export const crewSpeech = createServerFn({ method: "POST" })
  .inputValidator((d: { text: string; voice: string; accent: string }) => ({
    text: String(d.text).slice(0, 400), voice: String(d.voice).slice(0, 30), accent: String(d.accent).slice(0, 30),
  }))
  .handler(async ({ data }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) return { error: "Online-Stimmen nicht konfiguriert." };
    const prompt = `Say this like a relaxed, real airport ground crew member on a headset, ${data.accent} English accent, natural pace: ${data.text}`;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: data.voice } } } },
        stream_format: "audio",
      }),
    });
    if (!res.ok) {
      const msg = res.status === 402 ? "KI-Guthaben aufgebraucht." : res.status === 429 ? "Zu viele Anfragen, kurz warten." : `Stimme nicht verfügbar (${res.status}).`;
      return { error: msg };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), type: res.headers.get("content-type") || "audio/wav" };
  });
