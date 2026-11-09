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
  ground: { gpu: true, chocks: true, cones: true, fuel: false, catering: false, cargo: true, paxDoors: true, stairs: true },
  enginesRunning: { 1: false, 2: false },
  towbarConnected: false,
  pinInserted: false,
  log: [],
  nextId: 1,
});

export const equipmentClear = (s: CrewState) => Object.values(s.ground).every((v) => !v);

const dirPhrase = (d: PushDirection) =>
  d === "straight" ? "straight back" : d === "left" ? "tail left, nose facing right" : "tail right, nose facing left";

export const DIRECTION_LABEL: Record<PushDirection, string> = {
  straight: "Gerade zurück",
  left: "Heck nach links",
  right: "Heck nach rechts",
};

const norm = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bone\b/g, "1")
    .replace(/\btwo\b/g, "2")
    .replace(/\s+/g, " ")
    .trim();

type Intent =
  | "contact"
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

export function detectIntent(raw: string): { intent: Intent; engine?: 1 | 2 } | null {
  const t = norm(raw);
  const has = (...w: string[]) => w.some((x) => t.includes(x));
  if (has("stop", "hold position", "emergency")) return { intent: "stop" };
  if (has("steering pin", "bypass pin", "remove pin", "remove the pin")) return { intent: "remove_pin" };
  if (has("disconnect", "tow bar", "towbar", "towing system", "tug away")) return { intent: "disconnect" };
  if (has("engines clear", "engine clear", "all clear", "area clear", "clear to start")) {
    if (has("start")) return { intent: "start_engine", engine: t.includes("1") ? 1 : 2 };
    return { intent: "engines_clear" };
  }
  if (has("start", "starting") && has("engine")) return { intent: "start_engine", engine: t.includes("1") ? 1 : 2 };
  if (has("brake") && has("release", "off")) return { intent: "brakes_released" };
  if (has("brake") && has("set", "on", "parked")) return { intent: "brakes_set" };
  if (has("ready for push", "ready to push", "request push", "pushback", "push back", "ready for departure"))
    return { intent: "ready_push" };
  if (has("equipment", "remove chocks", "chocks")) return { intent: "equipment_clear" };
  if (has("close") && has("door")) return { intent: "close_doors" };
  if (has("gpu", "ground power", "external power")) return { intent: "remove_gpu" };
  if (has("tail left", "face right", "facing right")) return { intent: "dir_left" };
  if (has("tail right", "face left", "facing left")) return { intent: "dir_right" };
  if (has("straight")) return { intent: "dir_straight" };
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
      return ["Ground, cockpit, how do you read?"];
    case "connected":
    case "ready":
      if (!equipmentClear(s)) return ["Close all doors please.", "Disconnect ground power.", "Confirm ground equipment clear."];
      return ["Ready for pushback."];
    case "awaiting_release":
      return ["Brakes released."];
    case "pushing":
      return ["Starting engine two.", "Stop the pushback."];
    case "push_complete":
      return ["Parking brake set."];
    case "parked":
      if (!s.enginesRunning[2]) return ["Starting engine two."];
      if (!s.enginesRunning[1]) return ["Starting engine one."];
      return ["Disconnect the towing system."];
    case "disconnecting":
      return s.pinInserted ? ["Remove steering pin."] : ["All engines clear, thank you."];
    case "complete":
      return ["Thanks for your help, good day."];
  }
}

export type Effect = { type: "speak"; text: string } | { type: "startPush" };

function push(s: CrewState, from: Message["from"], text: string): CrewState {
  return { ...s, log: [...s.log, { id: s.nextId, from, text, at: Date.now() }], nextId: s.nextId + 1 };
}

export type Result = { state: CrewState; reply: string | null; effects: Effect[] };

const crew = (s: CrewState, text: string, extra: Effect[] = []): Result => ({
  state: push(s, "crew", text),
  reply: text,
  effects: [{ type: "speak", text }, ...extra],
});

/** Main entry: pilot says something, crew answers based on context. */
export function handlePilot(prev: CrewState, input: string): Result {
  const text = input.trim();
  if (!text) return { state: prev, reply: null, effects: [] };
  let s = push(prev, "pilot", text);
  const m = detectIntent(text);
  if (!m) return crew(s, `Say again, cockpit. Suggest: "${suggestions(prev)[0]}"`);

  if (s.phase === "idle" && m.intent !== "contact")
    return withPhase(crew(s, "Cockpit, ground here, I'm on the headset now. Please repeat your request."), "connected");

  switch (m.intent) {
    case "contact":
      if (s.phase === "idle") return withPhase(crew(s, "Ground to cockpit, reading you five by five. Headset connected, standing by."), "connected");
      return crew(s, "Loud and clear, cockpit. Go ahead.");

    case "stop":
      if (s.phase === "pushing") return withPhase(crew(s, "Stopping now! Pushback stopped. Set parking brake."), "push_complete");
      return crew(s, "Copy, holding. We are not moving.");

    case "close_doors":
      s = { ...s, ground: { ...s.ground, cargo: false, paxDoors: false, stairs: false } };
      return crew(s, "Closing all cargo doors and removing the stairs. All doors closed.");

    case "remove_gpu":
      s = { ...s, ground: { ...s.ground, gpu: false } };
      return crew(s, "Ground power disconnected. Confirm you are on APU power.");

    case "equipment_clear":
      if (!["connected", "ready"].includes(s.phase)) return crew(s, "Ground equipment already clear, cockpit.");
      if (s.ground.fuel) return crew(s, "Negative, refuelling still in progress. Stand by.");
      s = { ...s, ground: Object.fromEntries(Object.keys(s.ground).map((k) => [k, false])) as CrewState["ground"] };
      return withPhase(crew(s, "All doors closed, chocks removed, GPU disconnected. Ground equipment clear. Ready for pushback when you are."), "ready");

    case "dir_left":
    case "dir_right":
    case "dir_straight": {
      const d: PushDirection = m.intent === "dir_left" ? "left" : m.intent === "dir_right" ? "right" : "straight";
      s = { ...s, direction: d };
      return crew(s, `Copy, pushback ${dirPhrase(d)}.`);
    }

    case "ready_push":
      if (!equipmentClear(s)) return crew(s, "Negative, cockpit. Ground equipment is not clear yet. Request equipment removal first.");
      if (["connected", "ready"].includes(s.phase)) {
        s = { ...s, towbarConnected: true, pinInserted: true };
        return withPhase(crew(s, `Tow bar connected, steering pin inserted. Pushback ${dirPhrase(s.direction)}. Release parking brake.`), "awaiting_release");
      }
      return crew(s, "Pushback already in progress, cockpit.");

    case "brakes_released":
      if (s.phase !== "awaiting_release") return crew(s, "Copy, but we are not ready to push. Please set brakes.");
      return withPhase(crew(s, `Brakes released, pushing back ${dirPhrase(s.direction)}. You are cleared to start engines.`, [{ type: "startPush" }]), "pushing");

    case "start_engine": {
      const e = m.engine ?? 2;
      if (!["pushing", "parked", "push_complete"].includes(s.phase)) return crew(s, "Negative, standby for engine start until pushback begins.");
      s = { ...s, enginesRunning: { ...s.enginesRunning, [e]: true } };
      return crew(s, `Area clear, cleared to start engine ${e === 1 ? "one" : "two"}.`);
    }

    case "brakes_set":
      if (s.phase === "push_complete") return withPhase(crew(s, "Parking brake set, copy. Continue engine start, call me when ready to disconnect."), "parked");
      return crew(s, "Copy, parking brake set.");

    case "engines_clear":
      if (s.phase === "disconnecting" && !s.pinInserted) return withPhase(crew(s, "All engines clear. Disconnecting headset now, watch for my hand signal on your left. Have a good flight!"), "complete");
      return crew(s, "Engines area is clear, cockpit.");

    case "disconnect":
      if (s.phase !== "parked") return crew(s, s.phase === "pushing" ? "Negative, we are still moving." : "Negative, no tow bar to disconnect at this stage.");
      s = { ...s, towbarConnected: false };
      return withPhase(crew(s, "Disconnecting tow bar. Tug is clear. Steering pin still installed, request removal."), "disconnecting");

    case "remove_pin":
      if (!s.pinInserted) return crew(s, "Steering pin is not installed, cockpit.");
      if (s.towbarConnected) return crew(s, "Negative, disconnect the towing system first.");
      s = { ...s, pinInserted: false };
      return crew(s, "Steering pin removed, I'll show it on the left side. Confirm all engines clear before I disconnect.");

    case "status":
      return crew(s, statusLine(s));

    case "thanks":
      if (s.phase === "complete") return crew(s, "You're welcome, have a safe flight. Ground out.");
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
  return withPhase(crew(s, "Pushback complete. Set parking brake, please."), "push_complete");
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
