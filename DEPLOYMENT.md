# Panzer Duell auf Coolify und Cloudflare R2

Diese Anleitung ist absichtlich in zwei sichere Phasen aufgeteilt:

1. Zuerst läuft das vollständige Spiel allein über Coolify.
2. Erst danach werden die großen Dateien auf R2 umgeschaltet.

Wenn Phase 2 nicht funktioniert, wird `ASSET_BASE_URL` in Coolify wieder geleert.
Das Spiel verwendet dann sofort wieder die im Docker-Image enthaltenen Dateien.

## Gewählte Adressen

- Spiel: `https://panzer.wilski.tech`
- WebSocket: `wss://panzer.wilski.tech/ws`
- R2-Dateien: `https://panzer-assets.wilski.tech`
- Interner Container-Port: `8000`

Port 8000 wird nicht öffentlich in Cloudflare eingetragen.

## 1. Projekt in das GitHub-Repository übertragen

In diesem lokalen Projekt ist derzeit noch kein GitHub-Remote eingetragen.

### Variante A: GitHub Desktop

1. GitHub Desktop öffnen.
2. `File` → `Add local repository`.
3. Den Ordner `D:\KI Projekte\Games\Tank Wars` auswählen.
4. Falls das Repository noch nicht auf GitHub existiert: `Publish repository`.
5. Falls es bereits existiert, dessen Remote-Adresse in den Repository-Einstellungen
   eintragen.
6. Als Commit-Nachricht `Coolify deployment vorbereiten` eingeben.
7. `Commit to main` und anschließend `Push origin` anklicken.

### Variante B: PowerShell

Nur verwenden, wenn das GitHub-Repository leer ist:

```powershell
cd "D:\KI Projekte\Games\Tank Wars"
git remote add origin https://github.com/DEIN-NAME/DEIN-REPOSITORY.git
git add .
git commit -m "Coolify deployment vorbereiten"
git branch -M main
git push -u origin main
```

`DEIN-NAME` und `DEIN-REPOSITORY` müssen ersetzt werden. Wenn `git push`
abgelehnt wird, nicht mit Gewalt überschreiben, sondern zuerst Hilfe holen.

## 2. Cloudflare-DNS für das Spiel prüfen

Viele vorhandene Anwendungen verwenden bereits `*.wilski.tech`. Deshalb kann
bereits ein Wildcard-DNS-Eintrag vorhanden sein.

1. Cloudflare öffnen.
2. Die Zone `wilski.tech` auswählen.
3. `DNS` → `Records` öffnen.
4. Nach einem Eintrag für `*` oder `panzer` suchen.
5. Wenn ein funktionierender Wildcard-Eintrag existiert, nichts ändern.
6. Andernfalls einen `A`-Eintrag erstellen:
   - Name: `panzer`
   - IPv4 address: öffentliche IP des Coolify-Servers
   - Proxy status: `Proxied` (orange Wolke)
   - TTL: `Auto`

Unter `SSL/TLS` sollte der Modus `Full (strict)` verwendet werden, sobald
Coolify sein Zertifikat für die Domain ausgestellt hat.

## 3. Anwendung in Coolify anlegen

1. In Coolify das Projekt und die Umgebung `production` öffnen.
2. `+ New` anklicken.
3. `Application` wählen.
4. Das GitHub-Repository auswählen:
   - Öffentliches Repository: `Public Repository`
   - Privates Repository: über die Coolify GitHub App
5. Branch `main` auswählen.
6. Build Pack `Dockerfile` auswählen.
7. Dockerfile-Pfad: `/Dockerfile`
8. Interner Port beziehungsweise `Ports Exposes`: `8000`
9. Keine Host-Port-Zuordnung wie `8000:8000` anlegen.
10. Domain eintragen: `https://panzer.wilski.tech`

## 4. Umgebungsvariablen in Coolify

Unter `Environment Variables` diese Werte eintragen:

```text
PORT=8000
NODE_ENV=production
ALLOWED_ORIGINS=https://panzer.wilski.tech
ASSET_BASE_URL=
ASSET_VERSION=2026-06-30-1
```

`ASSET_BASE_URL` bleibt in der ersten Phase absichtlich leer.

## 5. Coolify-Healthcheck

Der Docker-Container besitzt bereits einen eingebauten Healthcheck. Falls
Coolify zusätzlich Werte verlangt:

- Healthcheck enabled: `On`
- Path: `/health`
- Port: `8000`
- Expected status: `200`
- Start period beziehungsweise Grace period: mindestens `15 seconds`

Wichtig: zunächst nur eine Instanz beziehungsweise ein Replica starten. Die
laufenden Matches liegen momentan im Arbeitsspeicher eines Servers.

## 6. Erstes Deployment

1. In Coolify `Deploy` anklicken.
2. Warten, bis der Status `Running` beziehungsweise `Healthy` erscheint.
3. Diese Adresse öffnen:

   `https://panzer.wilski.tech/health`

4. Eine Antwort ähnlich dieser muss erscheinen:

```json
{"status":"ok","uptimeSeconds":42,"clients":0,"queuedPlayers":0,"activeMatches":0}
```

5. Danach `https://panzer.wilski.tech` öffnen.
6. Zuerst Singleplayer testen.
7. Danach die Gruppenlobby in mehreren Browserfenstern oder auf mehreren
   Geräten testen.

Bis hierhin wird R2 noch nicht benötigt.

## 7. R2-Dateipaket lokal erstellen

In PowerShell:

```powershell
cd "D:\KI Projekte\Games\Tank Wars"
npm run prepare:r2
```

Danach liegt hier ein vorbereiteter Ordner:

`D:\KI Projekte\Games\Tank Wars\deploy\r2\assets`

Er enthält nur die Dateien, die das Spiel im Browser wirklich benötigt.

## 8. R2-Bucket erstellen und Dateien hochladen

1. Cloudflare öffnen.
2. `R2 Object Storage` öffnen.
3. `Create bucket` wählen.
4. Bucket-Name: `panzer-duell-assets`
5. Den Bucket öffnen.
6. Den kompletten lokalen Ordner `deploy\r2\assets` hochladen.
7. Im Bucket muss anschließend die oberste Verzeichnisebene `assets` heißen.

Beispiel:

```text
assets/
  tank_runtime.glb
  powerups/
  audio/
  ui/
```

Die Dateien `tank.glb` und `tank_base.glb` werden nicht hochgeladen.

## 9. R2-Custom-Domain verbinden

1. Im R2-Bucket `Settings` öffnen.
2. Unter `Custom Domains` → `Add` wählen.
3. `panzer-assets.wilski.tech` eintragen.
4. Verbindung bestätigen.
5. Warten, bis Domain und SSL den Status `Active` zeigen.
6. Die öffentliche `r2.dev`-Adresse für den Produktionsbetrieb nicht verwenden.

## 10. R2-CORS konfigurieren

Im R2-Bucket unter `Settings` → `CORS Policy` folgende Richtlinie eintragen:

```json
[
  {
    "AllowedOrigins": ["https://panzer.wilski.tech"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Danach im Browser prüfen:

`https://panzer-assets.wilski.tech/assets/ui/panzer-duell-title.png`

Das Titelbild muss direkt erscheinen.

## 11. Coolify auf R2 umschalten

Erst wenn der direkte R2-Test funktioniert:

1. In Coolify die Anwendung öffnen.
2. `Environment Variables` öffnen.
3. Ändern:

```text
ASSET_BASE_URL=https://panzer-assets.wilski.tech
ASSET_VERSION=2026-06-30-1
```

4. Speichern und `Redeploy` ausführen.
5. Spiel öffnen und Titelbild, Musik, Panzer und alle Kisten prüfen.

Bei einem Fehler:

1. `ASSET_BASE_URL` wieder leeren.
2. Speichern.
3. Erneut deployen.

Damit ist der sichere Coolify-Fallback wieder aktiv.

## 12. Cloudflare-Einstellungen

1. Unter `Network` prüfen, dass `WebSockets` aktiviert ist.
2. Für `panzer.wilski.tech` keine Cache-Everything-Regel verwenden.
3. Für `panzer-assets.wilski.tech` darf eine Cache-Regel verwendet werden.
4. Bei neuen Asset-Dateien `ASSET_VERSION` erhöhen, beispielsweise auf
   `2026-07-01-1`, und Coolify neu deployen.

Cloudflare kann bestehende WebSocket-Verbindungen bei Wartungen trennen. Der
Spielclient verbindet sich automatisch neu; ein laufender Panzer wird bei einem
Abbruch vorübergehend von der CORE AI übernommen.

## 13. Wichtige Betriebsregel

Noch keine horizontale Skalierung und keine mehreren Coolify-Replikas
aktivieren. Mehrere unabhängige Prozesse würden verschiedene Warteschlangen und
Matches im eigenen Arbeitsspeicher führen.

Ein Coolify-Redeploy beendet aktuell laufende Matches. Updates deshalb zunächst
nur durchführen, wenn keine Spieler aktiv sind. Der Health-Endpunkt zeigt die
Anzahl unter `activeMatches`.
