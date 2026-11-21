export function onApplicationStart(api) {
  api.log("info", "Pushback-Beispielplugin gestartet");
  api.registerTab({
    id: "pushback-example",
    label: "Pushback Plus",
    icon: "Truck",
  });
}

export function onPushbackStarted(api, event) {
  api.log("info", `Pushback gestartet: ${event.direction}`);
}

export function onPushbackStopped(api, event) {
  api.log("info", `Pushback gestoppt: ${event.reason || "Benutzeraktion"}`);
}
