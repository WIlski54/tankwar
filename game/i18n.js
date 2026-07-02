// game/i18n.js — central bilingual UI text table (Deutsch / English).
// t(key, vars) resolves a key in the active language and interpolates {vars}.
// Static DOM nodes opt in via data-i18n / data-i18n-placeholder / data-i18n-html.

const TEXTS = {
  de: {
    "title.pilot": "PILOT",
    "title.namePlaceholder": "NAME EINGEBEN",
    "title.nameHint": "2–16 ZEICHEN",
    "title.nameShort": "NAME ZU KURZ (MIN. 2 ZEICHEN)",
    "title.single": "SINGLEPLAYER",
    "title.two": "2 SPIELER",
    "title.multi": "MULTIPLAYER",
    "title.language": "SPRACHE",
    "title.difficulty": "SCHWIERIGKEIT",
    "title.languageValue": "DEUTSCH",
    "title.online": "ONLINE",
    "difficulty.easy": "LEICHT",
    "difficulty.medium": "MITTEL",
    "difficulty.hard": "SCHWER",
    "platform.desktop": "PC",
    "platform.tablet": "TOUCH",
    "loading.sync": "GRID WIRD SYNCHRONISIERT …",
    "loading.asset": "TANK-ASSET WIRD GELADEN",
    "loading.assetError": "ASSET-LINK FEHLER<br><small>Bitte über start_server.bat starten.</small>",
    "loading.networkError": "NETZWERK-MATCH KONNTE NICHT GELADEN WERDEN",
    "mode.platformDesktop": "PC / MAC",
    "mode.platformTablet": "IPAD TOUCH",
    "mode.solo": "SOLO // CORE AI",
    "mode.local": "LOKAL // SPLIT LINK",
    "mode.online": "ONLINE // TEAM {team} // SERVER AUTHORITATIVE",
    "announce.engage": "ENGAGE",
    "announce.teamEngage": "TEAM {team} // ENGAGE",
    "announce.ammoEmpty": "{name} // MUNITION LEER",
    "announce.newLife": "{name} // NEUES LEBEN",
    "announce.lifeLost": "{name} // LEBEN VERLOREN",
    "announce.wallDestroyed": "MAUER ZERSTÖRT",
    "announce.minePlaced": "{name} // MINE GELEGT · {count} ÜBRIG",
    "announce.mineMax": "{name} // MAXIMAL {max} MINEN AKTIV",
    "announce.energy": "{name} // {armor}% ENERGIE",
    "announce.shieldDestroyed": "{name} // SCHILD ZERSTÖRT · {armor}% ENERGIE",
    "announce.shieldHits": "{name} // SCHILD {hits}/5",
    "announce.reflectHits": "{name} // REFLEKTION {hits}/5",
    "announce.uplink": "{name} // ORBITALER UPLINK",
    "announce.uplinkLive": "ORBITALER UPLINK // LIVE",
    "announce.portal": "{name} // {entry} → {exit}",
    "announce.takeover": "{name} ÜBERNIMMT",
    "announce.paused": "PAUSE",
    "announce.resume": "WEITER",
    "result.complete": "MATCH COMPLETE",
    "result.wins": "{name} GEWINNT",
    "result.teamWins": "TEAM {team} GEWINNT",
    "result.again": "REVANCHE",
    "result.menu": "ZURÜCK ZUM MENÜ",
    "hud.ammo": "MUNITION {count}",
    "hud.shieldNormal": "SCHILD {sec}s · {hits} TREFFER",
    "hud.shieldReflect": "SPIEGEL {sec}s · {hits} TREFFER",
    "hud.lethal": "☠ TÖDLICHER SCHUSS BEREIT",
    "hud.breaker": "⚒ MAUERBRECHER {count}",
    "hud.mines": "MINEN {count} · M",
    "hud.satellite": "◉ SATELLIT 1 · U",
    "hud.orbital": "ORBITAL {sec}s",
    "lobby.eyebrow": "MULTIPLAYER // GROUP LINK",
    "lobby.heading": "TEAM-LOBBY",
    "lobby.connecting": "VERBINDE MIT DEM MATCH-SERVER …",
    "lobby.connected": "SERVER VERBUNDEN // LOBBY WIRD SYNCHRONISIERT",
    "lobby.reconnecting": "VERBINDUNG UNTERBROCHEN // NEUER VERSUCH …",
    "lobby.error": "SERVER NICHT ERREICHBAR // NEUER VERSUCH LÄUFT",
    "lobby.disconnected": "SERVERVERBINDUNG GETRENNT",
    "lobby.waiting": "WARTE AUF {count} WEITERE PILOTEN // AB 3 SPIELERN IST DAS MATCH BEREIT",
    "lobby.readyBot": "MATCH BEREIT // 3 PILOTEN + CORE AI // 2 GEGEN 2",
    "lobby.readyFull": "MATCH BEREIT // 4 PILOTEN // 2 GEGEN 2",
    "lobby.slotFree": "PLATZ FREI",
    "lobby.you": "DU",
    "lobby.onlineTag": "ONLINE",
    "lobby.waitingTag": "WARTET",
    "lobby.bench": "{count} weitere Piloten warten serverseitig auf das nächste Team-Match.",
    "lobby.serverLive": "Live-Server verbunden: Eingaben gehen an den Server; Bewegung, Treffer, Extras und Siegerentscheidung werden autoritativ synchronisiert.",
    "lobby.leave": "LOBBY VERLASSEN",
    "lobby.vs": "VS",
    "touch.drive": "FAHREN",
    "touch.aim": "TURM / ROHR",
    "touch.fire": "FEUER",
    "powerup.health": "+50% ENERGIE",
    "powerup.life": "+1 LEBEN",
    "powerup.ammo": "+5 MUNITION",
    "powerup.shield": "AEGIS-SCHILD",
    "powerup.reflect": "SPIEGELSCHILD",
    "powerup.lethal": "TÖDLICHER SCHUSS",
    "powerup.hammer": "+3 MAUERBRECHER",
    "powerup.mine": "+3 MINEN",
    "powerup.satellite": "SATELLITEN-UPLINK",
  },
  en: {
    "title.pilot": "PILOT",
    "title.namePlaceholder": "ENTER NAME",
    "title.nameHint": "2–16 CHARACTERS",
    "title.nameShort": "NAME TOO SHORT (MIN. 2 CHARACTERS)",
    "title.single": "SINGLEPLAYER",
    "title.two": "2 PLAYERS",
    "title.multi": "MULTIPLAYER",
    "title.language": "LANGUAGE",
    "title.difficulty": "DIFFICULTY",
    "title.languageValue": "ENGLISH",
    "title.online": "ONLINE",
    "difficulty.easy": "EASY",
    "difficulty.medium": "MEDIUM",
    "difficulty.hard": "HARD",
    "platform.desktop": "PC",
    "platform.tablet": "TOUCH",
    "loading.sync": "SYNCHRONIZING GRID …",
    "loading.asset": "LOADING TANK ASSET",
    "loading.assetError": "ASSET LINK ERROR<br><small>Please launch via start_server.bat.</small>",
    "loading.networkError": "NETWORK MATCH FAILED TO LOAD",
    "mode.platformDesktop": "PC / MAC",
    "mode.platformTablet": "IPAD TOUCH",
    "mode.solo": "SOLO // CORE AI",
    "mode.local": "LOCAL // SPLIT LINK",
    "mode.online": "ONLINE // TEAM {team} // SERVER AUTHORITATIVE",
    "announce.engage": "ENGAGE",
    "announce.teamEngage": "TEAM {team} // ENGAGE",
    "announce.ammoEmpty": "{name} // OUT OF AMMO",
    "announce.newLife": "{name} // NEW LIFE",
    "announce.lifeLost": "{name} // LIFE LOST",
    "announce.wallDestroyed": "WALL DESTROYED",
    "announce.minePlaced": "{name} // MINE PLACED · {count} LEFT",
    "announce.mineMax": "{name} // MAX {max} MINES ACTIVE",
    "announce.energy": "{name} // {armor}% ENERGY",
    "announce.shieldDestroyed": "{name} // SHIELD DESTROYED · {armor}% ENERGY",
    "announce.shieldHits": "{name} // SHIELD {hits}/5",
    "announce.reflectHits": "{name} // REFLECTION {hits}/5",
    "announce.uplink": "{name} // ORBITAL UPLINK",
    "announce.uplinkLive": "ORBITAL UPLINK // LIVE",
    "announce.portal": "{name} // {entry} → {exit}",
    "announce.takeover": "{name} TAKES OVER",
    "announce.paused": "PAUSED",
    "announce.resume": "RESUME",
    "result.complete": "MATCH COMPLETE",
    "result.wins": "{name} WINS",
    "result.teamWins": "TEAM {team} WINS",
    "result.again": "RE-MATCH",
    "result.menu": "BACK TO MENU",
    "hud.ammo": "AMMO {count}",
    "hud.shieldNormal": "SHIELD {sec}s · {hits} HITS",
    "hud.shieldReflect": "MIRROR {sec}s · {hits} HITS",
    "hud.lethal": "☠ LETHAL SHOT READY",
    "hud.breaker": "⚒ WALL BREAKER {count}",
    "hud.mines": "MINES {count} · M",
    "hud.satellite": "◉ SATELLITE 1 · U",
    "hud.orbital": "ORBITAL {sec}s",
    "lobby.eyebrow": "MULTIPLAYER // GROUP LINK",
    "lobby.heading": "TEAM LOBBY",
    "lobby.connecting": "CONNECTING TO MATCH SERVER …",
    "lobby.connected": "SERVER CONNECTED // SYNCING LOBBY",
    "lobby.reconnecting": "CONNECTION LOST // RETRYING …",
    "lobby.error": "SERVER UNREACHABLE // RETRY IN PROGRESS",
    "lobby.disconnected": "SERVER CONNECTION CLOSED",
    "lobby.waiting": "WAITING FOR {count} MORE PILOTS // MATCH READY FROM 3 PLAYERS",
    "lobby.readyBot": "MATCH READY // 3 PILOTS + CORE AI // 2 VS 2",
    "lobby.readyFull": "MATCH READY // 4 PILOTS // 2 VS 2",
    "lobby.slotFree": "SLOT OPEN",
    "lobby.you": "YOU",
    "lobby.onlineTag": "ONLINE",
    "lobby.waitingTag": "WAITING",
    "lobby.bench": "{count} more pilots are queued server-side for the next team match.",
    "lobby.serverLive": "Live server connected: inputs go to the server; movement, hits, power-ups and the match result are synchronized authoritatively.",
    "lobby.leave": "LEAVE LOBBY",
    "lobby.vs": "VS",
    "touch.drive": "DRIVE",
    "touch.aim": "TURRET / BARREL",
    "touch.fire": "FIRE",
    "powerup.health": "+50% ENERGY",
    "powerup.life": "+1 LIFE",
    "powerup.ammo": "+5 AMMO",
    "powerup.shield": "AEGIS SHIELD",
    "powerup.reflect": "MIRROR SHIELD",
    "powerup.lethal": "LETHAL SHOT",
    "powerup.hammer": "+3 WALL BREAKERS",
    "powerup.mine": "+3 MINES",
    "powerup.satellite": "SATELLITE UPLINK",
  },
};

const STORAGE_KEY = "panzer-duell.language";
let language = "de";
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "de" || stored === "en") language = stored;
} catch {
  // Storage can be unavailable in hardened/private browser contexts.
}

export function getLanguage() {
  return language;
}

export function setLanguage(next) {
  language = next === "en" ? "en" : "de";
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Preference simply won't persist.
  }
  applyStaticTexts();
  return language;
}

export function toggleLanguage() {
  return setLanguage(language === "de" ? "en" : "de");
}

export function t(key, vars = {}, fallback) {
  const template = TEXTS[language][key] ?? TEXTS.de[key] ?? fallback ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) => (
    vars[name] !== undefined ? String(vars[name]) : match
  ));
}

// Re-applies every data-i18n annotated node. Called on boot and language switch.
export function applyStaticTexts(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  for (const node of root.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
}
