import { encodeWav } from "./recorder";

export function speakerTestTone(): Blob {
  const rate = 24000;
  const samples = new Float32Array(rate);
  for (let i = 0; i < samples.length; i++) {
    const t = i / rate;
    const envelope = Math.min(1, t * 30, (1 - t) * 30);
    samples[i] = Math.sin(2 * Math.PI * 440 * t) * 0.2 * envelope;
  }
  return encodeWav([samples], rate);
}

export async function playDeviceTest(audio: HTMLAudioElement, outputDeviceId: string) {
  const routed = audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (routed.setSinkId) await routed.setSinkId(outputDeviceId);
  await audio.play();
}