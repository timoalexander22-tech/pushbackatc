// Pure ground-crew dialogue engine. No React, no browser APIs — so a future
// Windows/SimConnect build can reuse it and feed real aircraft state in.

export type PushDirection = "straight" | "left" | "right";

export type Phase =
  | "idle" // no interphone contact yet
  | "connected" // crew on headset, turnaround in progress
  | "ready" // equipment clear, crew asked for pushback
  | "awaiting_release" // tug connected, waiting for brakes released
  | "pushing"
  | "push_complete" // stopped, waiting for parking brake set
  | "parked" // brake set after push, engines may be started
  | "disconnecting"
  | "complete";

export type GroundItem =
  | "gpu"
  | "chocks"
  | "cones"
  | "fuel"
  | "catering"
  | "cargo"
  | "paxDoors"
  | "stairs";

export const GROUND_ITEMS: { id: GroundItem; label: string; active: string; inactive: string }[] = [
  { id: "gpu", label: "Bodenstrom (GPU)", active: "Angeschlossen", inactive: "Getrennt" },
  { id: "chocks", label: "Bremsklötze", active: "Gesetzt", inactive: "Entfernt" },
  { id: "cones", label: "Sicherheitskegel", active: "Aufgestellt", inactive: "Eingesammelt" },
  { id: "fuel", label: "Betankung", active: "Läuft", inactive: "Beendet" },
  { id: "catering", label: "Catering", active: "Am Flugzeug", inactive: "Abgefahren" },
  { id: "cargo", label: "Frachttüren", active: "Offen", inactive: "Geschlossen" },
  { id: "paxDoors", label: "Passagiertüren", active: "Offen", inactive: "Geschlossen" },
  { id: "stairs", label: "Treppe / Fluggastbrücke", active: "Angedockt", inactive: "Entfernt" },
];

export type Message = { id: number; from: "pilot" | "crew" | "system"; text: string; at: number };

export type CrewState = {
  phase: Phase;
  direction: PushDirection;
  facing: string | null; // compass direction the nose faces after push
  ground: Record<GroundItem, boolean>;
  enginesRunning: { 1: boolean; 2: boolean };
  towbarConnected: boolean;
  pinInserted: boolean;
  log: Message[];
  nextId: number;
};

export const initialState = (direction: PushDirection = "straight"): CrewState => ({
  phase: "idle",
  direction,
  facing: null,
  ground: { gpu: true, chocks: true, cones: true, fuel: false, catering: false, cargo: true, paxDoors: true, stairs: true },
  enginesRunning: { 1: false, 2: false },
  towbarConnected: false,
  pinInserted: false,
  log: [{ id: 1, from: "crew", text: "Cockpit, Ground.", at: Date.now() }],
  nextId: 2,
});

export const equipmentClear = (s: CrewState) => Object.values(s.ground).every((v) => !v);

const pushPhrase = (s: CrewState) => (s.facing ? `facing ${s.facing}` : dirPhrase(s.direction));

const COMPASS: [RegExp, string][] = [
  [/\bnorth ?east\b/, "north-east"], [/\bnorth ?west\b/, "north-west"], [/\bsouth ?east\b/, "south-east"], [/\bsouth ?west\b/, "south-west"],
  [/\bnorth\b/, "north"], [/\bsouth\b/, "south"], [/\beast\b/, "east"], [/\bwest\b/, "west"],
];
export function detectFacing(raw: string): string | null {
  const t = norm(raw);
  if (!/\b(facing|face|nose|heading)\b/.test(t)) return null;
  const hits = COMPASS.filter(([r]) => r.test(t)).map(([, v]) => v);
  const main = hits.filter((h) => !hits.some((o) => o !== h && o.includes(h)));
  return main.length === 1 ? (main[0] ?? null) : null;
}

const dirPhrase = (d: PushDirection) =>
  d === "straight" ? "straight back" : d === "left" ? "tail left, nose facing right" : "tail right, nose facing left";

export const DIRECTION_LABEL: Record<PushDirection, string> = {
  straight: "Gerade zurück",
  left: "Heck nach links",
  right: "Heck nach rechts",
};

// Words we may auto-correct (misheard/typo). Safety-critical words (left, right,
// compass points, numbers, set/release, stop) are never fuzzy-matched: no guessing.
const VOCAB = ["ground", "cockpit", "pushback", "equipment", "disconnect", "towbar", "steering", "bypass", "brakes", "parking", "engine", "engines", "starting", "doors", "remove", "removed", "chocks", "power", "request", "ready", "facing", "straight", "status", "thanks", "headset", "interphone", "complete", "connected", "towing"];
const SPOKEN: [RegExp, string][] = [
  [/\bpush ?back\b|\bpush bag\b|\bpush pack\b/g, "pushback"], [/\bbreaks?\b/g, "brakes"], [/\btow ?bar\b|\btoe bar\b/g, "towbar"],
  [/\b(engine|engines|number) (to|too)\b/g, "$1 2"], [/\b(engine|engines|number) (won|on)\b/g, "$1 1"],
  [/\bwon\b/g, "1"], [/\bone\b/g, "1"], [/\btwo\b/g, "2"], [/\bphasing\b|\bfaceing\b|\bfacin\b/g, "facing"],
  [/\bstraight back\b|\bstraight out\b|\bdirectly back\b/g, "straight"],
];
function lev(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length] ?? 0;
}
const fix = (w: string) => {
  if (w.length < 5 || VOCAB.includes(w)) return w;
  const max = w.length >= 8 ? 2 : 1;
  let best: string | null = null, bd = 99, tie = false;
  for (const v of VOCAB) { const x = lev(w, v); if (x < bd) { bd = x; best = v; tie = false; } else if (x === bd) tie = true; }
  return best && bd <= max && !tie ? best : w;
};
export const norm = (t: string) => {
  let x = t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  x = x.split(" ").map(fix).join(" ");
  for (const [r, v] of SPOKEN) x = x.replace(r, v);
  return x.replace(/\s+/g, " ").trim();
};

/** Relative direction anywhere in a sentence; null if absent, "ambiguous" if both sides named. */
export function detectRelative(raw: string): PushDirection | "ambiguous" | null {
  const t = norm(raw);
  const left = /\btail (to the )?left\b|\b(nose|facing|face) (to the )?right\b/.test(t);
  const right = /\btail (to the )?right\b|\b(nose|facing|face) (to the )?left\b/.test(t);
  if (left && right) return "ambiguous";
  if (left) return "left";
  if (right) return "right";
  if (/\bstraight\b/.test(t)) return "straight";
  return null;
}

type Intent =
  | "contact"
  | "go_ahead"
  | "farewell"
  | "equipment_clear"
  | "close_doors"
  | "remove_gpu"
  | "ready_push"
  | "brakes_released"
  | "brakes_set"
  | "start_engine"
  | "engines_clear"
  | "disconnect"
  | "remove_pin"
  | "status"
  | "dir_left"
  | "dir_right"
  | "dir_straight"
  | "stop"
  | "thanks";

export function detectIntent(raw: string): { intent: Intent; engine?: 1 | 2 | undefined; engines?: (1 | 2)[] | undefined } | null {
  const t = norm(raw);
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (/\b(go ahead|ahead go)\b/.test(t)) return { intent: "go_ahead" };
  if (has("standing by", "stand by", "visual signal", "safe flight")) return { intent: "farewell" };
  if (has("stop", "hold position", "emergency")) return { intent: "stop" };
  if (has("steering pin", "bypass pin", "remove pin", "remove the pin")) return { intent: "remove_pin" };
  if (has("disconnect", "tow bar", "towbar", "towing system", "tug away")) return { intent: "disconnect" };
  if (has("engines clear", "engine clear", "all clear", "area clear", "clear to start")) {
    if (has("start")) return { intent: "start_engine", engine: /\b1\b/.test(t) ? 1 : /\b2\b/.test(t) ? 2 : undefined };
    return { intent: "engines_clear" };
  }
  if (has("start", "starting", "light up") && has("engine", "number")) {
    const one = /\b1\b/.test(t), two = /\b2\b/.test(t);
    return { intent: "start_engine", engine: one && !two ? 1 : two && !one ? 2 : undefined, engines: one && two && /\b(and|then)\b/.test(t) ? [2, 1] : undefined };
  }
  const rel = has("release", "off"), set = /\b(set|on|parked|applied)\b/.test(t);
  if (has("brake") && rel && !set) return { intent: "brakes_released" };
  if (has("brake") && set && !rel) return { intent: "brakes_set" };
  if (has("ready for push", "ready to push", "request push", "pushback", "ready for departure", "ready to go", "request push"))
    return { intent: "ready_push" };
  if (has("equipment", "remove chocks", "chocks")) return { intent: "equipment_clear" };
  if (has("close") && has("door")) return { intent: "close_doors" };
  if (has("gpu", "ground power", "external power")) return { intent: "remove_gpu" };
  const r = detectRelative(raw);
  if (r === "left") return { intent: "dir_left" };
  if (r === "right") return { intent: "dir_right" };
  if (r === "straight") return { intent: "dir_straight" };
  if (has("status", "how long", "progress")) return { intent: "status" };
  if (has("thank", "bye", "good day", "cheers")) return { intent: "thanks" };
  if (has("ground", "cockpit", "how do you read", "radio check", "hello", "good morning", "good evening"))
    return { intent: "contact" };
  return null;
}

/** Commands that make sense in the current phase (shown as suggestions and in training). */
export function suggestions(s: CrewState): string[] {
  switch (s.phase) {
    case "idle":
      return ["Ground, go ahead."];
    case "connected":
    case "ready":
      if (!equipmentClear(s)) return ["Close all doors please.", "Disconnect ground power.", "Confirm ground equipment clear."];
      return ["Roger, we have pushback clearance, facing north. Brakes are released.", "Ready for push, tail left. Brakes released.", "Ready for pushback, straight back. Brakes released."];
    case "awaiting_release":
      return ["Brakes released."];
    case "pushing":
      return ["Starting engines two and one.", "Stop the pushback."];
    case "push_complete":
      return ["Parking brake set."];
    case "parked":
      if (!s.enginesRunning[2]) return ["Starting engine two."];
      if (!s.enginesRunning[1]) return ["Starting engine one."];
      return ["Disconnect the towing system."];
    case "disconnecting":
      return s.pinInserted ? ["Remove steering pin."] : ["Roger, standing by on the left. Have a safe flight!"];
    case "complete":
      return ["Thanks for your help, good day."];
  }
}

export type Effect = { type: "speak"; text: string } | { type: "startPush" };

function push(s: CrewState, from: Message["from"], text: string): CrewState {
  return { ...s, log: [...s.log, { id: s.nextId, from, text, at: Date.now() }], nextId: s.nextId + 1 };
}

export type Result = { state: CrewState; reply: string | null; effects: Effect[] };

/** Pick a phrasing variant; rotates with the message counter so it's deterministic but varied. */
const pick = (s: CrewState, ...v: string[]): string => v[s.nextId % v.length] ?? v[0] ?? "";

const crew = (s: CrewState, text: string, extra: Effect[] = []): Result => ({
  state: push(s, "crew", text),
  reply: text,
  effects: [{ type: "speak", text }, ...extra],
});

const readyReport = (s: CrewState): Result => {
  if (s.ground.fuel) return crew(s, "Refuelling is still in progress. Stand by for pushback.");
  const ground = Object.fromEntries(Object.keys(s.ground).map((k) => [k, false])) as CrewState["ground"];
  return withPhase(crew({ ...s, ground, pinInserted: true }, "All doors and hatches are closed, chocks are removed, bypass pin is installed. Ready for pushback when you are."), "ready");
};

/** Main entry: pilot says something, crew answers based on context. */
export function handlePilot(prev: CrewState, input: string): Result {
  const text = input.trim();
  if (!text) return { state: prev, reply: null, effects: [] };
  let s = push(prev, "pilot", text);
  const facing = detectFacing(text);
  const rel = detectRelative(text);
  const early = ["idle", "connected", "ready", "awaiting_release"].includes(s.phase);
  if (rel === "ambiguous") return crew(s, "Cockpit, say again direction, I copied both left and right.");
  if (/\b(facing|nose|heading)\b/.test(norm(text)) && !facing && !rel && early)
    return crew(s, "Cockpit, say again the direction you want to face after push.");
  if (facing && early) s = { ...s, facing };
  else if (rel && early) s = { ...s, direction: rel, facing: null };
  const m = detectIntent(text);
  if (!m) return crew(s, pick(s, "Cockpit, ground, say again?", "Sorry cockpit, you were broken, say again.", "Ground, didn't copy that, say again please.") + ` (z. B. „${suggestions(prev)[0]}“)`);

  const normalized = norm(text);
  const pushRequested = /\bpushback\b|\bready (for|to) push\b|\brequest push\b/.test(normalized);
  const brakeRelease = /\bbrakes?\b/.test(normalized) && /\b(released?|off)\b/.test(normalized);
  if (pushRequested && brakeRelease) {
    if (/\b(set|on|applied|not|never|don t)\b/.test(normalized)) return crew(s, "Cockpit, confirm parking brake status before pushback.");
    if (!equipmentClear(s) || !["ready", "connected", "awaiting_release"].includes(s.phase)) return crew(s, "Negative, cockpit. Stand by until ground equipment is clear and the tug is connected.");
    s = { ...s, towbarConnected: true, pinInserted: true };
    return withPhase(crew(s, `Brakes released, commencing pushback, ${pushPhrase(s)}. Cleared to start engines at your discretion.`, [{ type: "startPush" }]), "pushing");
  }

  if (s.phase === "idle" && m.intent !== "contact" && m.intent !== "go_ahead")
    return withPhase(crew(s, pick(s, "Ground to cockpit, I'm on the headset now, go ahead with your request again.", "Cockpit, ground here, just plugged in. Say again your request?")), "connected");

  switch (m.intent) {
    case "go_ahead":
      if (["idle", "connected", "ready"].includes(s.phase)) return readyReport(s);
      return crew(s, statusLine(s));
    case "farewell":
      if (s.phase === "disconnecting" && !s.pinInserted && !s.towbarConnected) return withPhase(crew(s, "Thank you, goodbye!"), "complete");
      return crew(s, "Stand by, ground operations are not complete yet.");
    case "contact":
      if (s.phase === "idle") return withPhase(crew(s, pick(s, "Ground to cockpit, loud and clear. Ground power still connected, chocks in place. Go ahead.", "Cockpit, ground, reading you five. Turnaround nearly done, standing by.", "Hello cockpit, ground here, I read you fine. Ready when you are.")), "connected");
      return crew(s, pick(s, "Loud and clear, go ahead.", "Reading you fine, cockpit, go ahead."));

    case "stop":
      if (s.phase === "pushing") return withPhase(crew(s, "Stopping! Tug stopped. Set parking brake and advise."), "push_complete");
      return crew(s, "Copy, holding position, we are not moving.");

    case "close_doors":
      s = { ...s, ground: { ...s.ground, cargo: false, paxDoors: false, stairs: false } };
      return crew(s, pick(s, "Copy, closing up the cargo holds and pulling the stairs. All doors closed and locked on the outside.", "Wilco. Cargo doors closed, stairs removed, all doors closed from my side."));

    case "remove_gpu":
      s = { ...s, ground: { ...s.ground, gpu: false } };
      return crew(s, pick(s, "Copy, removing ground power. GPU disconnected, confirm you're on APU.", "Ground power off and disconnected, cockpit. You're on your own power."));

    case "equipment_clear":
      if (!["connected", "ready"].includes(s.phase)) return crew(s, "Ground equipment is already clear, cockpit.");
      if (s.ground.fuel) return crew(s, "Negative, refuelling still in progress. Stand by, I'll call you back.");
      s = { ...s, ground: Object.fromEntries(Object.keys(s.ground).map((k) => [k, false])) as CrewState["ground"] };
      return withPhase(crew(s, pick(s, "All doors closed, GPU disconnected, chocks removed. Ground equipment clear, bypass pin inserted. Ready for push on your call.", "Doors closed, GPU removed, chocks out. Equipment's clear, tug in position. Call me when ready for pushback.")), "ready");

    case "dir_left":
    case "dir_right":
    case "dir_straight": {
      const d: PushDirection = m.intent === "dir_left" ? "left" : m.intent === "dir_right" ? "right" : "straight";
      if (facing) return crew(s, `Copy, nose facing ${facing} after push.`);
      s = { ...s, direction: d, facing: null };
      return crew(s, `Copy, pushback ${dirPhrase(d)}.`);
    }

    case "ready_push":
      if (!equipmentClear(s)) return crew(s, "Negative, cockpit, not ready yet. Ground equipment is still at the aircraft, request removal first.");
      if (["connected", "ready"].includes(s.phase)) {
        s = { ...s, towbarConnected: true, pinInserted: true };
        return withPhase(crew(s, pick(s, `Copy, cleared for pushback ${pushPhrase(s)}. Tow bar connected, bypass pin inserted. Release parking brake.`, `Pushback ${pushPhrase(s)}, roger. Tug connected, pin is in. Release brakes please.`)), "awaiting_release");
      }
      return crew(s, "Pushback already in progress, cockpit.");

    case "brakes_released":
      if (s.phase !== "awaiting_release") return crew(s, "Negative, keep the brakes set, tug is not connected yet.");
      return withPhase(crew(s, pick(s, `Brakes released, commencing pushback ${pushPhrase(s)}. Cleared to start engines.`, `Copy, brakes off. Starting push ${pushPhrase(s)}, cleared to start engines at your discretion.`), [{ type: "startPush" }]), "pushing");

    case "start_engine": {
      if (!m.engine && !m.engines) return crew(s, "Cockpit, say again which engine, one or two?");
      const e = m.engine;
      if (!["pushing", "parked", "push_complete"].includes(s.phase)) return crew(s, "Negative, stand by for engine start, I'll call you.");
      if (m.engines) {
        s = { ...s, enginesRunning: { 1: true, 2: true } };
        return crew(s, "Starting engines two and one, roger. Both engine areas are clear.");
      }
      if (!e) return crew(s, "Cockpit, say again which engine, one or two?");
      s = { ...s, enginesRunning: { ...s.enginesRunning, [e]: true } };
      return crew(s, pick(s, `Engine ${e === 1 ? "one" : "two"}, area is clear, cleared to start.`, `Copy, clear to start number ${e === 1 ? "one" : "two"}.`));
    }

    case "brakes_set":
      if (s.phase === "push_complete") return withPhase(crew({ ...s, towbarConnected: false, pinInserted: false }, "Disconnecting tow bar and removing bypass pin. Stand by for visual signal on the left side."), "disconnecting");
      return crew(s, "Copy, parking brake set.");

    case "engines_clear":
      if (s.phase === "disconnecting" && !s.pinInserted) return withPhase(crew(s, pick(s, "All clear. Disconnecting headset, look for hand signals on your left. Have a nice flight!", "Copy, all engines stable. Headset off now, hand signals on the left. Bye bye, good flight!")), "complete");
      return crew(s, "Engine areas are clear, cockpit.");

    case "disconnect":
      if (s.phase !== "parked") return crew(s, s.phase === "pushing" ? "Negative, we are still moving." : "Negative, no tow bar to disconnect at this stage.");
      s = { ...s, towbarConnected: false };
      return withPhase(crew(s, pick(s, "Copy, disconnecting. Tow bar disconnected, bypass pin still in, removing on your call.", "Disconnecting tug now. Tow bar is off, pin still installed.")), "disconnecting");

    case "remove_pin":
      if (!s.pinInserted) return crew(s, "Bypass pin is not installed, cockpit.");
      if (s.towbarConnected) return crew(s, "Negative, disconnect the towing system first.");
      s = { ...s, pinInserted: false };
      return crew(s, "Bypass pin removed, I'll show it on your left. Confirm engines stable before I disconnect headset.");

    case "status":
      return crew(s, statusLine(s));

    case "thanks":
      if (s.phase === "complete" || (s.phase === "disconnecting" && !s.pinInserted)) return withPhase(crew(s, "Thank you, goodbye!"), "complete");
      return crew(s, "Anytime, cockpit. Standing by.");
  }
}

function withPhase(r: Result, phase: Phase): Result {
  return { ...r, state: { ...r.state, phase } };
}

export function statusLine(s: CrewState): string {
  const map: Record<Phase, string> = {
    idle: "No contact yet.",
    connected: equipmentClear(s) ? "Turnaround complete, equipment clear." : "Turnaround in progress.",
    ready: "Ready for pushback, awaiting your call.",
    awaiting_release: "Tug connected, awaiting brake release.",
    pushing: "Pushback in progress.",
    push_complete: "Pushback complete, set parking brake.",
    parked: "Parked on the taxiway, tug still connected.",
    disconnecting: "Tug disconnected.",
    complete: "All ground operations complete.",
  };
  return map[s.phase];
}

/** Push timer finished (called by the UI). */
export function completePush(s: CrewState): Result {
  if (s.phase !== "pushing") return { state: s, reply: null, effects: [] };
  return withPhase(crew(s, "Pushback completed. Set parking brake."), "push_complete");
}

export function toggleGround(s: CrewState, item: GroundItem): CrewState {
  if (!["idle", "connected", "ready"].includes(s.phase)) return s;
  const next = { ...s, ground: { ...s.ground, [item]: !s.ground[item] } };
  return next.phase === "ready" && !equipmentClear(next) ? { ...next, phase: "connected" } : next;
}

export const PHASE_LABEL: Record<Phase, string> = {
  idle: "Keine Verbindung",
  connected: "Abfertigung",
  ready: "Bereit zum Pushback",
  awaiting_release: "Schlepper angekoppelt",
  pushing: "Pushback läuft",
  push_complete: "Pushback beendet",
  parked: "Bremse gesetzt",
  disconnecting: "Schlepper getrennt",
  complete: "Abgeschlossen",
};

export const PHASE_ORDER: Phase[] = ["idle", "connected", "ready", "awaiting_release", "pushing", "push_complete", "parked", "disconnecting", "complete"];
