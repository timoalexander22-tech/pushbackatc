// Pure voice picker: same airport + same day => same crew voice; changes daily.
export const CREW_VOICES = ["Charon", "Puck", "Fenrir", "Orus", "Kore", "Aoede", "Zephyr", "Leda", "Enceladus", "Algenib", "Iapetus", "Umbriel"];

const ACCENTS: [RegExp, string][] = [
  [/^(ED|ET|LO|LS)/, "German"], [/^LF/, "French"], [/^LE/, "Spanish"], [/^LI/, "Italian"],
  [/^(EG|EI)/, "British"], [/^(K|C)/, "American"], [/^Y/, "Australian"], [/^EH/, "Dutch"],
];

export function pickVoice(airport: string, date = new Date()) {
  const icao = airport.trim().toUpperCase() || "XXXX";
  const key = `${icao}-${date.toISOString().slice(0, 10)}`;
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const accent = ACCENTS.find(([r]) => r.test(icao))?.[1] ?? "neutral";
  return { voice: CREW_VOICES[h % CREW_VOICES.length] ?? "Charon", accent };
}
