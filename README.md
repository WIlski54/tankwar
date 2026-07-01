# Tank Wars // Neon Arena

Ein vollständiges lokales Third-Person-Panzerduell in Three.js:

- Solo gegen eine Computer-KI
- Lokaler Zwei-Spieler-Modus mit geteilter Third-Person-Ansicht
- Tron-inspirierte schwarze Neon-Arena mit offenem Labyrinth
- Fahrphysik, animierte Ketten, Turmsteuerung, Geschosse und Kollisionen
- Geschwindigkeitsabhängiges Fahrgeräusch sowie Explosionen bei Wand- und Panzertreffern
- Drei Leben mit je 100 % Energie; jeder Treffer verursacht 20 % Schaden
- Zehn Schuss Startmunition und neun Power-up-Typen in mehreren, räumlich verteilten Instanzen
- Energie-, Leben- und Munitionskisten, zwei Schildtypen und ein seltener tödlicher Schuss

## Power-ups

- Med-Box: regeneriert bis zu 50 Prozentpunkte des aktuellen Lebens
- Tank-Cube: gewährt ein zusätzliches Leben
- Hypercube-Crate mit Granate: gewährt fünf zusätzliche Geschosse
- Aegis-Cube: schützt 20 Sekunden oder vor fünf Treffern
- Circuit-Crate mit Spiegelsymbol: reflektiert bis zu fünf Treffer, maximal 20 Sekunden lang
- Crimson-Skull-Crate: gewährt genau einen tödlichen Schuss. Ohne Schild
  zerstört er das aktuelle Panzerleben sofort. Ein aktiver Schild wird stattdessen
  vollständig zerstört und der Treffer verursacht 50 Prozentpunkte Schaden.
- Hammer-Crate: Die nächsten drei normalen Geschosse werden zu Mauerbrechern und
  entfernen getroffene innere Labyrinthwände samt Kollision und Sichtblockade.
- Mine-Cube: gewährt drei nahezu unsichtbare Minen. Spieler 1 legt sie mit `M`,
  Spieler 2 im lokalen Duell mit `Num 5`. Nach kurzer Scharfschaltung verursacht
  eine vom gegnerischen Panzer überfahrene Mine 60 Prozentpunkte Schaden.
- Satellitenkiste: gewährt genau eine orbitale Liveansicht. `U` aktiviert zwölf
  Sekunden lang den animierten Kameraaufstieg über das gesamte Labyrinth.
  Eigener Panzer und Teammitglieder werden grün/weiß, Gegner rot markiert.

Lokal werden 14, im Netzwerkspiel 18 Power-up-Instanzen verwaltet. Pro
Labyrinthsektor können höchstens zwei gleichzeitig aktiv sein. Tödlicher Schuss
und Satellit bleiben seltene Einzelobjekte mit deutlich längeren Respawnzeiten.

Die für das Spiel optimierten Modelle liegen unter `assets/powerups/`. Mit
`tools/prepare_powerups.py` können neue hochauflösende Meshy-GLBs für den
Echtzeitbetrieb reduziert und auf eine einheitliche Größe gebracht werden.

## Build the tank asset (one-time, after changing the build pipeline)

```
python tools/build_tank.py
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --python tools\repair_turret_blender.py
```

The Python step produces `assets/tank_base.glb`. Blender adds the closed turret
skirt and exports `assets/tank.glb`. For the browser runtime, run
`tools/optimize_tank_runtime.py` through Blender to produce the lightweight
`assets/tank_runtime.glb` while retaining the named rig nodes.

## Netzwerk-Multiplayer

- Das Spiel startet mit dem Panzer-Duell-Titelbild und übernimmt eine persistente
  Piloten-ID. Die Titelmusik beginnt nach der ersten Benutzerinteraktion und
  blendet beim Matchstart aus.
- Die Modusauswahl bietet Singleplayer, lokales Spieler-vs.-Spieler und eine
  Gruppenlobby für 2-gegen-2-Teamspiele.
- Ab drei verbundenen Menschen ist ein Gruppenmatch bereit; bei genau drei
  Spielern besetzt die CORE AI den vierten Platz. Weitere Spieler bleiben für
  das nächste Match in der Warteschlange.
- `server/index.js` liefert Spiel und WebSocket-Endpunkt gemeinsam aus. Der
  Browser sendet ausschließlich Steuerbefehle; der Server berechnet Positionen,
  Geschosse, Treffer, Schilde, Extras, Minen, Portale, Respawns und Matchende.
- Die Simulation läuft mit 30 Ticks pro Sekunde und verteilt 15 Snapshots pro
  Sekunde. Browser interpolieren die Snapshots für eine flüssige Darstellung.
- Verliert ein Spieler während eines Matches die Verbindung, übernimmt die
  CORE AI seinen Panzer, damit das Teamspiel weiterlaufen kann.
- The arena uses a 24-unit base grid at 6x scale and fivefold expansion
  (720 x 720 units total).
- Its 5 x 5 labyrinth sectors reuse the original corridor scale with rotated
  layouts and batched rendering for stable performance.
- North, east, south, and west each provide a portal. Entering one selects one
  of the other three exits at random.
- Blue und Red bleiben die aktiven Plätze im lokalen Spiel. Online werden
  zusätzlich Yellow und Green als vollständige Matchplätze verwendet.

## Run

```
npm install
start_server.bat
```

Dann http://localhost:8000 öffnen. Für einen externen Server kann der Port mit
`PORT=8000 npm start` gesetzt werden. Ein vorgeschalteter HTTPS-Reverse-Proxy
muss WebSocket-Upgrades für `/ws` weiterleiten; der Browser verwendet unter
HTTPS automatisch `wss://`.

## Deployment

Die anfängerfreundliche Schritt-für-Schritt-Anleitung für GitHub, Coolify,
`panzer.wilski.tech` und Cloudflare R2 steht in `DEPLOYMENT.md`. Das erste
Deployment verwendet absichtlich die im Docker-Image enthaltenen Assets; R2
wird erst nach einem erfolgreichen Funktionstest zugeschaltet.

## Steuerung

**Solo:** WASD fahren, Maus horizontal und vertikal zielen, Linksklick feuern.
Alternativ richten Pfeil hoch/runter das Kanonenrohr vertikal aus.

**iPad / Touch:** Im Startmenü `IPAD / TOUCH` wählen. Links befindet sich das
virtuelle Fahrpad, rechts das kombinierte Turm-/Rohrpad sowie der Feuerknopf.
Alternativ: WASD fahren, Pfeiltasten zielen und Leertaste/Enter feuern.

**Lokales Duell:**

- Spieler 1: WASD fahren, Q/E Turm, R/F Rohrhöhe, Leertaste feuern
- Spieler 2: Pfeiltasten fahren, Komma/Punkt oder Numpad 4/6 Turm,
  Numpad 8/2 Rohrhöhe, Enter/Numpad 0 feuern

**Online:** WASD fahren, Maus zielen, Linksklick oder Leertaste feuern, `M`
für eine Mine und `U` für eine vorhandene Satellitenladung.

Escape pausiert bzw. setzt das Match fort.

## Performance

- Geschosse werden wiederverwendet und Partikel sowie Mauertrümmer laufen über
  einen festen Pool mit einem einzigen instanzierten Renderobjekt.
- Pro Spieler können höchstens sechs Minen gleichzeitig aktiv sein; sie laufen
  nach 75 Sekunden ab.
- Wandkollisionen und KI-Sichtlinien verwenden ein räumliches 36-Einheiten-Raster
  und exakte Segment-/AABB-Tests.
- Das Runtime-Panzermodell reduziert etwa 1,05 Millionen auf rund 150.000
  Dreiecke pro Panzer, ohne die steuerbaren Rig-Knoten zu entfernen.

## Tests

- Python build logic: `python tools/tests/test_segment.py` (and the other test_*.py)
- Runtime logic: `npm test`
