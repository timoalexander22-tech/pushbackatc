import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { open, Protocol, SimConnectConstants, SimConnectDataType, SimConnectPeriod } from "node-simconnect";
import WebSocket, { WebSocketServer } from "ws";
import { fileURLToPath } from "node:url";

const here = (p) => new URL(p, import.meta.url);
const VERSION = JSON.parse(readFileSync(here("./package.json"), "utf8")).version;

function readEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}
const env = { ...readEnv(here("../.env")), ...process.env };
const dataDir = env.VGC_COMPANION_DATA_DIR || fileURLToPath(new URL(".", import.meta.url));
const configPath = join(dataDir, "config.json");
const config = {
  port: 8787,
  invertSteering: false,
  ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, "utf8")) : {}),
};

function pairingCode() {
  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, "pairing-code.txt");
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const code = Array.from({ length: 6 }, () => abc[randomInt(abc.length)]).join("");
  writeFileSync(file, code);
  return code;
}
const CODE = pairingCode();

/** @type {import("../src/lib/sim/protocol").SimState} */
const state = {
  simConnected: false,
  aircraft: "",
  isFenix: false,
  onGround: true,
  parkingBrake: true,
  groundSpeed: 0,
  heading: 0,
  engines: { 1: false, 2: false },
  push: { active: false, progress: 0 },
};
let pushbackState = 3; // 3 = no pushback
let fenixBrake = null;

// ---------- SimConnect ----------
const DEF = 1, REQ = 1, DEF_FENIX = 2, REQ_FENIX = 2;
const EV_TOGGLE_PUSHBACK = 1, EV_TUG_HEADING = 2;
let sim = null;

const VARS = [
  ["PLANE HEADING DEGREES TRUE", "degrees", SimConnectDataType.FLOAT64],
  ["GROUND VELOCITY", "knots", SimConnectDataType.FLOAT64],
  ["SIM ON GROUND", "bool", SimConnectDataType.INT32],
  ["BRAKE PARKING POSITION", "bool", SimConnectDataType.INT32],
  ["GENERAL ENG COMBUSTION:1", "bool", SimConnectDataType.INT32],
  ["GENERAL ENG COMBUSTION:2", "bool", SimConnectDataType.INT32],
  ["PUSHBACK STATE", "enum", SimConnectDataType.INT32],
  ["TITLE", null, SimConnectDataType.STRING256],
];

async function connectSim() {
  try {
    const { recvOpen, handle } = await open("Virtual Ground Crew", Protocol.KittyHawk);
    sim = handle;
    state.simConnected = true;
    console.log(`SimConnect verbunden: ${recvOpen.applicationName}`);

    for (const [name, unit, type] of VARS) handle.addToDataDefinition(DEF, name, unit, type);
    handle.requestDataOnSimObject(REQ, DEF, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SIM_FRAME, 0, 0, 5);
    // Fenix drives its own parking brake lever; the stock simvar can lag behind it.
    handle.addToDataDefinition(DEF_FENIX, "L:S_MIP_PARKING_BRAKE", "number", SimConnectDataType.FLOAT64);
    handle.requestDataOnSimObject(REQ_FENIX, DEF_FENIX, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);

    handle.mapClientEventToSimEvent(EV_TOGGLE_PUSHBACK, "TOGGLE_PUSHBACK");
    handle.mapClientEventToSimEvent(EV_TUG_HEADING, "KEY_TUG_HEADING");

    handle.on("simObjectData", (d) => {
      if (d.requestID === REQ) {
        state.heading = d.data.readFloat64();
        state.groundSpeed = d.data.readFloat64();
        state.onGround = d.data.readInt32() === 1;
        const stockBrake = d.data.readInt32() === 1;
        state.engines = { 1: d.data.readInt32() === 1, 2: d.data.readInt32() === 1 };
        pushbackState = d.data.readInt32();
        state.aircraft = d.data.readString256();
        state.isFenix = /fenix/i.test(state.aircraft);
        state.parkingBrake = state.isFenix && fenixBrake !== null ? fenixBrake : stockBrake;
      } else if (d.requestID === REQ_FENIX) {
        fenixBrake = d.data.readFloat64() >= 0.5;
      }
    });
    handle.on("exception", (e) => {
      if (e.sendId && String(e.exception).includes("NAME_UNRECOGNIZED")) fenixBrake = null;
    });
    const lost = () => {
      if (!sim) return;
      console.log("SimConnect getrennt. Neuer Versuch in 5 s…");
      sim = null;
      state.simConnected = false;
      stopPush(false);
      setTimeout(connectSim, 5000);
    };
    handle.on("quit", lost);
    handle.on("close", lost);
    handle.on("error", lost);
  } catch {
    state.simConnected = false;
    setTimeout(connectSim, 5000);
  }
}

const sendEvent = (id, data = 0) => sim?.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, id, data, 1, 16);
const norm = (d) => ((d % 360) + 360) % 360;
const diff = (target, cur) => ((target - cur + 540) % 360) - 180;
const tugHeading = (deg) => sendEvent(EV_TUG_HEADING, Math.round(norm(deg) * 11930464.7111) | 0);

// ---------- Pushback control ----------
const COMPASS = { north: 0, northeast: 45, east: 90, southeast: 135, south: 180, southwest: 225, west: 270, northwest: 315 };
let push = null;

function startPush({ direction, facing, seconds }) {
  if (!sim || !state.simConnected || push) return;
  let target = null;
  if (facing && COMPASS[facing] !== undefined) target = COMPASS[facing];
  else if (direction === "left") target = norm(state.heading + 90);
  else if (direction === "right") target = norm(state.heading - 90);
  push = { t0: Date.now(), seconds: Math.min(Math.max(Number(seconds) || 30, 5), 180), target, span: target === null ? 0 : Math.abs(diff(target, state.heading)), settled: null };
  if (pushbackState === 3) sendEvent(EV_TOGGLE_PUSHBACK);
  state.push = { active: true, progress: 0 };
  console.log(`Pushback gestartet${target === null ? " (gerade)" : ` → ${Math.round(target)}°`}`);
}

function stopPush(notify) {
  if (!push) return;
  push = null;
  if (sim && pushbackState !== 3) sendEvent(EV_TOGGLE_PUSHBACK);
  state.push = { active: false, progress: 1 };
  if (notify) broadcast({ type: "event", event: "pushDone" });
  console.log("Pushback beendet");
}

function steerPush(direction) {
  if (!push) return;
  let target = null;
  if (direction === "left") target = norm(state.heading + 90);
  else if (direction === "right") target = norm(state.heading - 90);
  push.target = target;
  push.span = target === null ? 0 : Math.abs(diff(target, state.heading));
  push.settled = null;
  console.log(
    direction === "straight"
      ? "Pushback gerade"
      : `Pushback-Steuerung ${direction === "left" ? "links" : "rechts"}`,
  );
}

setInterval(() => {
  if (!push) return;
  const elapsed = (Date.now() - push.t0) / 1000;
  let done;
  if (push.target === null) {
    state.push.progress = Math.min(elapsed / push.seconds, 1);
    done = elapsed >= push.seconds;
  } else {
    const off = diff(push.target, state.heading);
    const steer = Math.max(-40, Math.min(40, off)) * (config.invertSteering ? -1 : 1);
    tugHeading(Math.abs(off) > 3 ? state.heading + steer : state.heading);
    if (Math.abs(off) <= 3) push.settled ??= Date.now();
    state.push.progress = push.span ? Math.min(Math.max(1 - Math.abs(off) / push.span, 0), 0.99) : 0.99;
    done = (push.settled && Date.now() - push.settled > 4000) || elapsed > push.seconds * 2.5;
  }
  if (done) stopPush(true);
}, 250);

function handleCommand(c) {
  if (c?.type !== "cmd") return;
  if (c.cmd === "push_start") startPush(c);
  else if (c.cmd === "push_steer") steerPush(c.direction);
  else if (c.cmd === "push_stop") stopPush(false);
}

// ---------- Transports ----------
const wss = new WebSocketServer({ port: config.port });
wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try { handleCommand(JSON.parse(String(raw))); } catch {}
  });
});

let relay = null;
if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY) {
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { realtime: { transport: WebSocket } });
  relay = supabase.channel(`vgc-sim-${CODE}`, { config: { broadcast: { self: false } } });
  relay.on("broadcast", { event: "cmd" }, ({ payload }) => handleCommand(payload)).subscribe((s) => {
    if (s === "SUBSCRIBED") console.log("Relay für iPad bereit.");
  });
} else {
  console.log("Hinweis: Keine Relay-Zugangsdaten gefunden (.env). iPad-Kopplung deaktiviert.");
}

function broadcast(msg, viaRelay = true) {
  const text = JSON.stringify(msg);
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(text);
  if (viaRelay) relay?.send({ type: "broadcast", event: "msg", payload: msg });
}

let tick = 0;
setInterval(() => broadcast({ type: "state", version: VERSION, data: state }, tick++ % 2 === 0), 250);

console.log("");
console.log("==============================================");
console.log(`  Virtual Ground Crew Companion ${VERSION}`);
console.log(`  Kopplungscode für das iPad:  ${CODE}`);
console.log(`  Lokal (Browser auf diesem PC): ws://localhost:${config.port}`);
console.log("==============================================");
console.log("Warte auf MSFS 2020…");
connectSim();
