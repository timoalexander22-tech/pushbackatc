# Plugin-Entwicklung

## Manifest

```json
{
  "id": "community.pushback-example",
  "name": "Pushback Beispiel",
  "version": "1.0.0",
  "author": "PushbackATC",
  "description": "Referenzplugin für Pushback-Ereignisse.",
  "entryPoint": "plugin.js",
  "apiVersion": "1.0"
}
```

Die Plugin-ID muss eindeutig sein. Unterstützt wird API-Version `1.0`.
Der Entry-Point muss relativ zum Plugin-Unterordner existieren.

## Installation

1. In der Windows-App **Plugins** öffnen.
2. **Ordner öffnen** wählen.
3. Einen Unterordner anlegen und dort `plugin.json` plus Entry-Point kopieren.
4. Zurück in **Plugins** auf **Neu laden** klicken.
5. Das Plugin aktivieren oder deaktivieren.

Fehlerhafte Plugins werden nicht geladen und in `application.log` protokolliert.

## Geplante kontrollierte API

Ein Entry-Point kann Application-, Pushback-, Funk-, Audio- und Tab-Ereignisse
über eine versionierte Sandbox-API behandeln:

- `onApplicationStart`
- `onApplicationShutdown`
- `onAircraftConnected`
- `onAircraftDisconnected`
- `onPushbackStarted`
- `onPushbackStopped`
- `onFrequencyChanged`
- `onAudioDeviceChanged`
- `onTabOpened`

Kernaktionen wie Pushback, Frequenz und Lautstärke werden nur über explizite
API-Methoden freigegeben. Direkte Zugriffe auf lokale Dateien oder interne
React- und Tauri-Dateien sind nicht Teil der Plugin-Schnittstelle.
