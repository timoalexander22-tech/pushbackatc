export function encodeWav(chunks: readonly Float32Array[], sampleRate: number): Blob {
  const length = chunks.reduce((s, c) => s + c.length, 0);
  const view = new DataView(new ArrayBuffer(44 + length * 2));
  const tag = (o: number, v: string) => {
    for (let i = 0; i < v.length; i++) view.setUint8(o + i, v.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, length * 2, true);
  let o = 44;
  for (const c of chunks)
    for (const v of c) {
      const s = Math.max(-1, Math.min(1, v));
      view.setInt16(o, s * (s < 0 ? 32768 : 32767), true);
      o += 2;
    }
  return new Blob([view.buffer], { type: "audio/wav" });
}

export type Recording = { stop: () => Promise<Blob>; cancel: () => void };

/** Records from the chosen microphone (deviceId "" = system default) into a WAV blob. */
export async function recordWav(deviceId: string): Promise<Recording> {
  const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true };
  if (deviceId) audio.deviceId = { exact: deviceId };
  const stream = await navigator.mediaDevices.getUserMedia({ audio });
  let ctx: AudioContext | undefined;
  let source: MediaStreamAudioSourceNode;
  let node: ScriptProcessorNode;
  let mute: GainNode;
  const chunks: Float32Array[] = [];
  try {
    ctx = new AudioContext();
    await ctx.resume();
    source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    mute = ctx.createGain();
    mute.gain.value = 0;
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(mute);
    mute.connect(ctx.destination);
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    await ctx?.close();
    throw e;
  }
  const close = () => {
    if (!ctx || ctx.state === "closed") return;
    stream.getTracks().forEach((t) => t.stop());
    node.onaudioprocess = null;
    node.disconnect();
    source.disconnect();
    mute.disconnect();
    void ctx.close();
  };
  return {
    async stop() {
      close();
      return encodeWav(chunks, ctx.sampleRate);
    },
    cancel: close,
  };
}

export async function blobToBase64(b: Blob) {
  const bytes = new Uint8Array(await new Response(b).arrayBuffer());
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
