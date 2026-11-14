# Virtual Ground Crew – Windows-Companion

Verbindet MSFS 2020 (SimConnect) mit der Virtual Ground Crew App auf iPad oder PC.

## Einrichtung

1. Node.js LTS von https://nodejs.org installieren.
2. Diesen Ordner auf den MSFS-PC kopieren (die `.env` im übergeordneten Ordner muss mitkopiert werden).
3. `start.bat` doppelklicken. Beim ersten Start werden die Abhängigkeiten installiert.
4. MSFS 2020 mit dem Fenix A320 starten.
5. In der App unter **Einstellungen → Simulator**:
   - **iPad / Tablet**: angezeigten Kopplungscode eintragen.
   - **Auf dem PC**: Adresse `ws://localhost:8787` verwenden.

## Was synchronisiert wird

- Parkbremse lösen/setzen → Crew startet bzw. beendet den Pushback.
- Triebwerk 1/2 läuft → wird im Status angezeigt.
- Pushback: Der Schlepper fährt im Simulator gerade, Heck links/rechts oder bis zur angesagten Kompassrichtung.

## Optionale `config.json`

```json
{ "port": 8787, "invertSteering": false }
```

`invertSteering: true` setzen, falls sich das Flugzeug beim Pushback in die falsche Richtung dreht.

## Update

Neue Version unter **Updates** in der App herunterladen, Ordner ersetzen, `pairing-code.txt` behalten, `start.bat` starten.
