import * as THREE from "three";
import {
  buildArena,
  destroyWall,
  queryWallsForSegment,
  queryWallsNear,
  restoreWalls,
  WALLS,
  WALL_HEIGHT,
  CYAN,
  MAGENTA,
} from "./arena.js?v=20260630-performance1";
import {
  DriveModel,
  Weapon,
  aimDirection,
  approachAngle,
  circlesOverlap,
  findWallHit,
  resolveWalls,
  segmentHitsWall,
  wrapAngle,
} from "./core.js?v=20260630-performance1";
import {
  animateTank,
  loadTank,
  setBarrelPitch,
  setTurretYaw,
} from "./tank.js?v=20260630-performance2";
import {
  ACTIVE_MATCH_TANK_IDS,
  getTankProfile,
} from "./tank-roster.js?v=20260628-audio2";
import { GameAudio, TitleMusic } from "./audio.js?v=20260630-title1";
import { assignGroupMatch } from "./matchmaking.js?v=20260630-multiplayer1";
import {
  absorbShieldHit,
  activateSatelliteView,
  activateShield,
  applyHit,
  expireSatelliteView,
  expireShield,
  grantAmmo,
  grantLethalShot,
  grantMines,
  grantSatelliteCharge,
  grantWallBreakerShots,
  grantLife,
  healArmor,
  initializeCombatant,
  restoreForRespawn,
} from "./gameplay.js?v=20260630-satellite1";
import {
  POWERUP_TYPES,
  consumePowerup,
  loadPowerups,
  removePowerups,
  syncNetworkPowerups,
  updatePowerupVisuals,
} from "./powerups.js?v=20260630-network1";
import {
  choosePortalExit,
  findEnteredPortal,
} from "./portals.js?v=20260629-portals1";
import {
  ParticlePool,
  ShellPool,
} from "./effects.js?v=20260630-performance2";
import { NetworkClient } from "./network-client.js?v=20260630-network1";
import { assetUrl } from "./asset-url.js?v=20260630-deploy1";

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;
renderer.autoClear = false;
document.getElementById("game").appendChild(renderer.domElement);
const PERFORMANCE_TEST_MODE = new URLSearchParams(location.search).has("perfTest");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02060b);
scene.fog = new THREE.FogExp2(0x02060b, 0.007);
const arena = buildArena();
scene.add(arena);
const portalVisuals = arena.children.filter((child) => child.name.startsWith("Portal_"));
scene.add(new THREE.HemisphereLight(0x8af4ff, 0x08020b, 0.82));
const keyLight = new THREE.DirectionalLight(0xb7f6ff, 2.2);
keyLight.position.set(-24, 48, 18);
scene.add(keyLight);
const magentaLight = new THREE.PointLight(MAGENTA, 34, 70, 2);
magentaLight.position.set(0, 7, 0);
scene.add(magentaLight);
const cyanLight = new THREE.PointLight(CYAN, 27, 60, 2);
cyanLight.position.set(-34, 8, -12);
scene.add(cyanLight);

const stars = new THREE.Points(
  new THREE.BufferGeometry().setFromPoints(Array.from({ length: 560 }, () => (
    new THREE.Vector3((Math.random() - 0.5) * 900, 16 + Math.random() * 55, (Math.random() - 0.5) * 900)
  ))),
  new THREE.PointsMaterial({ color: 0x57dff5, size: 0.12, transparent: true, opacity: 0.55 }),
);
scene.add(stars);
const particlePool = new ParticlePool(scene, 1400);
const shellPool = new ShellPool(scene);
const mineDiscGeometry = new THREE.CylinderGeometry(1.15, 1.3, 0.09, 24);
const mineDiscMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x010203,
  metalness: 0.9,
  roughness: 0.26,
  transparent: true,
  opacity: 0.24,
  depthWrite: false,
});
const mineSensorGeometry = new THREE.RingGeometry(0.16, 0.24, 18);
const mineSensorMaterial = new THREE.MeshBasicMaterial({
  color: 0xff263b,
  side: THREE.DoubleSide,
  transparent: true,
  opacity: 0.055,
  depthWrite: false,
  toneMapped: false,
});

const ui = {
  title: document.getElementById("title-screen"),
  playerName: document.getElementById("player-name"),
  nameError: document.getElementById("name-error"),
  enterGrid: document.getElementById("enter-grid"),
  pilotLabel: document.getElementById("pilot-label"),
  changePilot: document.getElementById("change-pilot"),
  menu: document.getElementById("menu"),
  lobby: document.getElementById("group-lobby"),
  lobbyStatus: document.getElementById("lobby-status"),
  teamAlpha: document.getElementById("team-alpha"),
  teamOmega: document.getElementById("team-omega"),
  serverNote: document.getElementById("server-note"),
  leaveLobby: document.getElementById("leave-lobby"),
  result: document.getElementById("result"),
  resultTitle: document.getElementById("result-title"),
  loading: document.getElementById("loading"),
  mode: document.getElementById("mode-label"),
  p1: document.getElementById("p1-hud"),
  p2: document.getElementById("p2-hud"),
  divider: document.getElementById("divider"),
  crosshair: document.getElementById("crosshair"),
  announce: document.getElementById("announce"),
  satelliteOverlay: document.getElementById("satellite-overlay"),
  touch: document.getElementById("touch-controls"),
  drivePad: document.getElementById("drive-pad"),
  aimPad: document.getElementById("aim-pad"),
  touchFire: document.getElementById("touch-fire"),
  controlHints: document.getElementById("control-hints"),
  soloModeDescription: document.getElementById("solo-mode-description"),
};
ui.title.style.setProperty(
  "--title-image",
  `url("${assetUrl("./assets/ui/panzer-duell-title.png")}")`,
);

const keys = new Set();
const pressedKeys = new Set();
const queuedActions = new Set();
const mouse = new THREE.Vector2();
let mouseFire = false;
let soloPitchInput = "mouse";
let mode = null;
let platform = "desktop";
let playerName = "";
let lobbyRoster = [];
let networkPlayerId = null;
let latestNetworkSnapshot = null;
let networkInputSequence = 0;
let networkInputAt = 0;
let lastNetworkEvent = 0;
let networkResultShown = false;
let networkMineQueued = false;
let networkSatelliteQueued = false;
let running = false;
let paused = false;
let matchOver = false;
let entities = [];
let shells = [];
let powerups = [];
let mines = [];
let hudRefreshAt = 0;
let measuredFps = 0;
let performanceFrames = 0;
let performanceSampleAt = performance.now();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const clock = new THREE.Clock();
const gameAudio = new GameAudio();
const titleMusic = new TitleMusic();
const networkClient = new NetworkClient({
  status: handleNetworkStatus,
  lobby: handleNetworkLobby,
  matchStart: startNetworkMatch,
  snapshot: handleNetworkSnapshot,
});
const BARREL_MIN_PITCH = -0.34;
const BARREL_MAX_PITCH = 0.32;
// Energy dome sized to fully enclose the tank. Its lower cap sits below the ground
// (hidden by the floor) so the bubble still has width at track level.
const SHIELD_RADII = { x: 6.5, y: 4.5, z: 6.5 };
const SHIELD_CENTER_Y = 1.5;
const SHIELD_FORM_TIME = 1.4; // seconds for the shield to build up around the tank
const POWERUP_HIT_RADIUS = 2.4; // a shell destroys a power-up crate within this range
const MAX_DEPLOYED_MINES_PER_PLAYER = 6;
const MINE_LIFETIME = 75;
const touchInput = {
  throttle: 0,
  steer: 0,
  turret: 0,
  pitch: 0,
  fire: false,
  fireQueued: false,
};

function preventGameKey(event) {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter"].includes(event.code)) {
    event.preventDefault();
  }
}

addEventListener("keydown", (event) => {
  preventGameKey(event);
  keys.add(event.code);
  if (!event.repeat) pressedKeys.add(event.code);
  if (mode === "ai" && (event.code === "ArrowUp" || event.code === "ArrowDown")) {
    soloPitchInput = "keys";
  }
  if (event.code === "Escape" && mode && !matchOver && entities.length === 2) togglePause();
  if (mode === "network" && event.code === "KeyM" && !event.repeat) networkMineQueued = true;
  if (mode === "network" && event.code === "KeyU" && !event.repeat) networkSatelliteQueued = true;
  if (running && mode !== "network" && !event.repeat
    && ["KeyM", "KeyU", "Numpad5", "Numpad7"].includes(event.code)) {
    queuedActions.add(event.code);
  }
});
addEventListener("keyup", (event) => {
  preventGameKey(event);
  keys.delete(event.code);
});
addEventListener("mousemove", (event) => {
  mouse.x = (event.clientX / innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / innerHeight) * 2 + 1;
  if (mode === "ai" && platform === "desktop") soloPitchInput = "mouse";
});
addEventListener("mousedown", (event) => {
  if (event.button === 0) mouseFire = true;
});
addEventListener("mouseup", (event) => {
  if (event.button === 0) mouseFire = false;
});
addEventListener("contextmenu", (event) => event.preventDefault());
addEventListener("resize", resize);

document.querySelectorAll("[data-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    gameAudio.unlock();
    if (button.dataset.mode === "group") {
      showGroupLobby();
      return;
    }
    startMatch(button.dataset.mode);
  });
});
document.querySelectorAll("[data-platform]").forEach((button) => {
  button.addEventListener("click", () => selectPlatform(button.dataset.platform));
});
document.getElementById("play-again").addEventListener("click", () => {
  if (mode === "network") {
    ui.result.classList.add("hidden");
    showGroupLobby();
    return;
  }
  gameAudio.unlock();
  startMatch(mode);
});
document.getElementById("back-menu").addEventListener("click", showMenu);
ui.enterGrid.addEventListener("click", enterGrid);
ui.playerName.addEventListener("focus", () => titleMusic.play());
ui.playerName.addEventListener("input", () => {
  titleMusic.play();
  ui.nameError.textContent = "2–16 ZEICHEN";
});
ui.playerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter") enterGrid();
});
ui.changePilot.addEventListener("click", showTitle);
ui.leaveLobby.addEventListener("click", () => {
  networkClient.leave();
  showMenu();
});

try {
  ui.playerName.value = localStorage.getItem("panzer-duell.player-name") ?? "";
} catch {
  // Storage can be unavailable in hardened/private browser contexts.
}

window.PanzerDuellLobby = Object.freeze({
  updatePlayers(players) {
    const incoming = Array.isArray(players) ? players : [];
    const localPlayer = { id: "local-player", name: playerName || "LOCAL PILOT", isLocal: true };
    lobbyRoster = incoming.some((player) => String(player?.id) === localPlayer.id)
      ? incoming
      : [localPlayer, ...incoming];
    renderLobby();
  },
  clearPlayers() {
    lobbyRoster = [{ id: "local-player", name: playerName || "LOCAL PILOT", isLocal: true }];
    renderLobby();
  },
});

function enterGrid() {
  const candidate = ui.playerName.value.trim().replace(/\s+/g, " ");
  if (candidate.length < 2) {
    ui.nameError.textContent = "NAME IST ZU KURZ";
    ui.playerName.focus();
    return;
  }

  playerName = candidate.slice(0, 16).toUpperCase();
  ui.playerName.value = playerName;
  ui.pilotLabel.textContent = playerName;
  try {
    localStorage.setItem("panzer-duell.player-name", playerName);
  } catch {
    // The player name still works for this session.
  }
  titleMusic.play();
  ui.title.classList.add("hidden");
  ui.lobby.classList.add("hidden");
  ui.menu.classList.remove("hidden");
}

function showTitle() {
  ui.menu.classList.add("hidden");
  ui.lobby.classList.add("hidden");
  ui.title.classList.remove("hidden");
  ui.playerName.focus();
  titleMusic.play();
}

function showGroupLobby() {
  running = false;
  matchOver = false;
  clearWorld();
  ui.menu.classList.add("hidden");
  ui.title.classList.add("hidden");
  ui.result.classList.add("hidden");
  ui.lobby.classList.remove("hidden");
  lobbyRoster = [{ id: "local-player", name: playerName, isLocal: true }];
  renderLobby();
  ui.lobbyStatus.textContent = "VERBINDE MIT DEM MATCH-SERVER …";
  networkClient.join(playerName);
}

function renderLobby() {
  if (!ui.lobby) return;
  const assignment = assignGroupMatch(lobbyRoster);
  let alpha = assignment.teams.alpha;
  let omega = assignment.teams.omega;

  if (assignment.status === "waiting") {
    alpha = assignment.waiting.filter((_, index) => index % 2 === 0);
    omega = assignment.waiting.filter((_, index) => index % 2 === 1);
    ui.lobbyStatus.textContent = `WARTE AUF ${assignment.requiredPlayers} WEITERE${
      assignment.requiredPlayers === 1 ? "N" : ""
    } PILOTEN // AB 3 SPIELERN IST DAS MATCH BEREIT`;
  } else {
    ui.lobbyStatus.textContent = assignment.botAdded
      ? "MATCH BEREIT // 3 PILOTEN + CORE AI // 2 GEGEN 2"
      : "MATCH BEREIT // 4 PILOTEN // 2 GEGEN 2";
  }

  renderTeam(ui.teamAlpha, alpha);
  renderTeam(ui.teamOmega, omega);
  ui.serverNote.textContent = assignment.bench.length
    ? `${assignment.bench.length} weitere Piloten warten serverseitig auf das nächste Team-Match.`
    : "Live-Server verbunden: Eingaben gehen an den Server; Bewegung, Treffer, Extras und Siegerentscheidung werden autoritativ synchronisiert.";
}

function renderTeam(container, members) {
  container.replaceChildren();
  for (let index = 0; index < 2; index += 1) {
    const player = members[index];
    const slot = document.createElement("div");
    slot.className = `team-slot${player ? "" : " empty"}`;
    const label = document.createElement("span");
    label.textContent = player?.name ?? "PLATZ FREI";
    const type = document.createElement("b");
    type.textContent = player?.isBot ? "CORE AI" : player?.isLocal ? "DU" : player ? "ONLINE" : "WAITING";
    slot.append(label, type);
    container.append(slot);
  }
}

function handleNetworkStatus(status) {
  if (ui.lobby.classList.contains("hidden")) return;
  const labels = {
    connecting: "VERBINDE MIT DEM MATCH-SERVER …",
    connected: "SERVER VERBUNDEN // LOBBY WIRD SYNCHRONISIERT",
    reconnecting: "VERBINDUNG UNTERBROCHEN // NEUER VERSUCH …",
    error: "SERVER NICHT ERREICHBAR // NEUER VERSUCH LÄUFT",
    disconnected: "SERVERVERBINDUNG GETRENNT",
  };
  ui.lobbyStatus.textContent = labels[status] ?? status.toUpperCase();
}

function handleNetworkLobby(message) {
  networkPlayerId = message.playerId;
  lobbyRoster = message.players.map((player) => ({
    ...player,
    isLocal: player.id === networkPlayerId,
  }));
  renderLobby();
}

function handleNetworkSnapshot(snapshot) {
  latestNetworkSnapshot = snapshot;
}

bindTouchPad(ui.drivePad, (x, y) => {
  touchInput.steer = -x;
  touchInput.throttle = y;
});
bindTouchPad(ui.aimPad, (x, y) => {
  touchInput.turret = -x;
  touchInput.pitch = y;
});
ui.touchFire.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  ui.touchFire.setPointerCapture(event.pointerId);
  touchInput.fire = true;
  touchInput.fireQueued = true;
});
for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  ui.touchFire.addEventListener(eventName, () => { touchInput.fire = false; });
}

function resize() {
  renderer.setSize(innerWidth, innerHeight);
}

function bindTouchPad(pad, onInput) {
  const stick = pad.querySelector(".touch-stick");
  let activePointer = null;
  const update = (event) => {
    const bounds = pad.getBoundingClientRect();
    const radius = Math.min(bounds.width, bounds.height) * 0.34;
    let dx = event.clientX - (bounds.left + bounds.width * 0.5);
    let dy = event.clientY - (bounds.top + bounds.height * 0.5);
    const distance = Math.hypot(dx, dy);
    if (distance > radius) {
      dx = dx / distance * radius;
      dy = dy / distance * radius;
    }
    stick.style.transform = `translate(${dx}px,${dy}px)`;
    onInput(dx / radius, -dy / radius);
  };
  pad.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    activePointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    update(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointer) update(event);
  });
  const release = (event) => {
    if (activePointer !== null && event.pointerId !== undefined && event.pointerId !== activePointer) return;
    activePointer = null;
    stick.style.transform = "translate(0,0)";
    onInput(0, 0);
  };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
  pad.addEventListener("lostpointercapture", release);
}

function selectPlatform(selectedPlatform) {
  platform = selectedPlatform;
  document.querySelectorAll("[data-platform]").forEach((button) => {
    button.classList.toggle("active", button.dataset.platform === platform);
  });
  ui.controlHints.innerHTML = platform === "tablet"
    ? "<span>IPAD SOLO<br>WASD · PFEILE · LEERTASTE · M · U</span><span>TOUCH LINKS<br>FAHREN / LENKEN</span><span>TOUCH RECHTS<br>ZIELEN · FEUER</span>"
    : "<span>SOLO<br>WASD · MAUS · KLICK · M · U</span><span>SPIELER 1<br>WASD · Q/E · R/F · LEERTASTE · M · U</span><span>SPIELER 2<br>PFEILE · ,/. · NUM 8/2 · ENTER · NUM 5/7</span>";
  ui.soloModeDescription.textContent = platform === "tablet"
    ? "Du gegen die CORE AI. Tastatur ohne Maus oder vollständige Touchsteuerung."
    : "Du gegen die taktische CORE AI. Maussteuerung für den Turm.";
}

function makeShield() {
  const group = new THREE.Group();
  group.position.y = SHIELD_CENTER_Y;

  // Single smooth energy dome (no wireframe / rings). Glossy fresnel + soft flowing
  // shimmer, and a bottom-to-top "build" reveal driven by the `build` uniform.
  const shellGeometry = new THREE.SphereGeometry(1, 64, 40);
  shellGeometry.scale(SHIELD_RADII.x, SHIELD_RADII.y, SHIELD_RADII.z);
  shellGeometry.computeVertexNormals();
  const shell = new THREE.Mesh(
    shellGeometry,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: {
        color: { value: new THREE.Color(0x39fff2) },
        opacity: { value: 0 },
        time: { value: 0 },
        build: { value: 0 },
        radii: { value: new THREE.Vector3(SHIELD_RADII.x, SHIELD_RADII.y, SHIELD_RADII.z) },
      },
      vertexShader: `
        uniform vec3 radii;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vUnit;
        void main() {
          vUnit = position / radii;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vView = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        uniform float build;
        varying vec3 vNormal;
        varying vec3 vView;
        varying vec3 vUnit;
        void main() {
          float height = vUnit.y * 0.5 + 0.5;          // 0 bottom .. 1 top
          float edge = build * 1.12;                    // formation front sweeps up
          if (height > edge) discard;                   // not yet built here
          vec3 n = normalize(vNormal);
          float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.2);
          float flow = 0.5 + 0.5 * sin(vUnit.y * 5.0 - time * 1.4
            + sin(atan(vUnit.z, vUnit.x) * 3.0) * 0.8);
          float shimmer = pow(flow, 3.0) * 0.22;
          float forming = build < 0.999 ? smoothstep(edge - 0.10, edge, height) : 0.0;
          float glow = 0.12 + rim * 1.2 + shimmer + forming * 1.7;
          vec3 tint = color * (0.7 + rim * 0.9 + forming * 1.3);
          gl_FragColor = vec4(tint, opacity * glow);
        }
      `,
    }),
  );
  shell.name = "ShieldShell";
  shell.geometry.userData.runtimeOwned = true;
  group.add(shell);
  return group;
}

function updateShieldVisual(entity, dt, now) {
  const active = Boolean(entity.shieldType);
  const spawnGlow = entity.invulnerable > 0 && !active;
  const color = active
    ? entity.shieldType === "reflect" ? 0xff5cff : 0x39fff2
    : entity.accent;
  const visible = active || spawnGlow;
  // Start the build-up animation on the rising edge of visibility.
  if (visible && !entity.shieldVisiblePrev) entity.shieldFormStart = now;
  entity.shieldVisiblePrev = visible;
  const pulse = active ? 0.5 + Math.sin(now * 8) * 0.08 : spawnGlow ? 0.22 : 0;
  const build = visible
    ? Math.min(1, (now - (entity.shieldFormStart ?? now)) / SHIELD_FORM_TIME)
    : 0;
  const shell = entity.shield.getObjectByName("ShieldShell");
  shell.material.uniforms.color.value.setHex(color);
  shell.material.uniforms.opacity.value = pulse;
  shell.material.uniforms.time.value = now;
  shell.material.uniforms.build.value = build;
  // Ellipsoid dome stays hull-aligned (no Y-spin); motion is in the shader.
  entity.shield.visible = visible;
}

function makeTacticalMarker() {
  const group = new THREE.Group();
  group.position.y = 7.4;
  group.visible = false;
  const tankMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const ringMaterial = tankMaterial.clone();
  ringMaterial.opacity = 0.42;
  const detailMaterial = new THREE.MeshBasicMaterial({
    color: 0x02080d,
    transparent: true,
    opacity: 0.82,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  const own = (geometry) => {
    geometry.userData.runtimeOwned = true;
    return geometry;
  };
  const addMesh = (parent, geometry, material, position, renderOrder = 90) => {
    const mesh = new THREE.Mesh(own(geometry), material);
    mesh.position.set(...position);
    mesh.renderOrder = renderOrder;
    parent.add(mesh);
    return mesh;
  };

  // Two broad tracks make the unit immediately readable as a tank from orbit.
  addMesh(group, new THREE.BoxGeometry(2.15, 0.24, 9.8), tankMaterial, [-3.45, 0, 0]);
  addMesh(group, new THREE.BoxGeometry(2.15, 0.24, 9.8), tankMaterial, [3.45, 0, 0]);
  for (const x of [-3.45, 3.45]) {
    for (const z of [-3.25, 0, 3.25]) {
      addMesh(group, new THREE.BoxGeometry(1.35, 0.28, 0.48), detailMaterial, [x, 0.16, z], 91);
    }
  }

  const hullShape = new THREE.Shape();
  hullShape.moveTo(-2.35, -4.3);
  hullShape.lineTo(2.35, -4.3);
  hullShape.lineTo(3.05, -2.25);
  hullShape.lineTo(2.75, 3.75);
  hullShape.lineTo(-2.75, 3.75);
  hullShape.lineTo(-3.05, -2.25);
  hullShape.closePath();
  const hull = addMesh(group, new THREE.ShapeGeometry(hullShape), tankMaterial, [0, 0.2, 0], 92);
  hull.rotation.x = -Math.PI / 2;
  addMesh(group, new THREE.BoxGeometry(3.7, 0.2, 1.15), detailMaterial, [0, 0.38, -2.45], 93);

  // The turret follows the real turret yaw, while the hull follows tank heading.
  const turretSymbol = new THREE.Group();
  turretSymbol.position.y = 0.42;
  group.add(turretSymbol);
  addMesh(
    turretSymbol,
    new THREE.CylinderGeometry(2.18, 2.42, 0.34, 18),
    tankMaterial,
    [0, 0, 0.25],
    94,
  );
  addMesh(turretSymbol, new THREE.BoxGeometry(0.72, 0.3, 5.4), tankMaterial, [0, 0.02, 3.5], 94);
  addMesh(turretSymbol, new THREE.BoxGeometry(1.18, 0.34, 0.65), tankMaterial, [0, 0.02, 6.25], 94);

  const ring = addMesh(
    group,
    new THREE.RingGeometry(9.2, 9.58, 48),
    ringMaterial,
    [0, -0.08, 0],
    88,
  );
  ring.rotation.x = -Math.PI / 2;

  group.userData.markerMaterial = tankMaterial;
  group.userData.colorMaterials = [
    { material: tankMaterial, opacityScale: 1 },
    { material: ringMaterial, opacityScale: 0.45 },
  ];
  group.userData.turretSymbol = turretSymbol;
  return group;
}

async function createEntity(index, type, profileId) {
  const profile = getTankProfile(profileId);
  const accent = profile.accent;
  const group = new THREE.Group();
  const rig = await loadTank(assetUrl("./assets/tank_runtime.glb"), accent);
  group.add(rig.root);
  const shield = makeShield(accent);
  const tacticalMarker = makeTacticalMarker();
  group.add(shield, tacticalMarker);
  scene.add(group);
  return initializeCombatant({
    id: index,
    type,
    profileId,
    profile,
    name: profile.name,
    accent,
    group,
    rig,
    shield,
    tacticalMarker,
    drive: new DriveModel(),
    weapon: new Weapon(),
    camera: new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900),
    satelliteCamera: new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1600),
    satelliteBlend: 0,
    score: 0,
    invulnerable: 1.5,
    alive: true,
    turretYaw: 0,
    barrelPitch: 0,
    aiDecisionAt: 0,
    aiSteerBias: index ? -1 : 1,
    mineDecisionAt: 0,
    respawnAt: 0,
    emptyNoticeAt: 0,
    portalReadyAt: 0,
  });
}

async function startMatch(selectedMode) {
  mode = selectedMode;
  titleMusic.fadeOut();
  soloPitchInput = platform === "desktop" ? "mouse" : "keys";
  running = false;
  paused = false;
  matchOver = false;
  clearWorld();
  ui.title.classList.add("hidden");
  ui.menu.classList.add("hidden");
  ui.lobby.classList.add("hidden");
  ui.result.classList.add("hidden");
  ui.loading.classList.remove("hidden");
  ui.mode.textContent = `${platform === "tablet" ? "IPAD TOUCH" : "PC / MAC"} // ${
    mode === "ai" ? "SOLO // CORE AI" : "LOCAL // SPLIT LINK"
  }`;
  ui.p2.classList.remove("hidden");
  ui.divider.classList.toggle("hidden", mode !== "local");
  ui.crosshair.classList.toggle("hidden", mode !== "ai");
  ui.touch.classList.toggle("hidden", !(platform === "tablet" && mode === "ai"));

  try {
    entities = await Promise.all([
      createEntity(0, "human", ACTIVE_MATCH_TANK_IDS[0]),
      createEntity(1, mode === "ai" ? "ai" : "human", ACTIVE_MATCH_TANK_IDS[1]),
    ]);
    entities[0].name = playerName || entities[0].name;
    powerups = await loadPowerups(scene, "local");
    resetMatch();
    if (PERFORMANCE_TEST_MODE) {
      for (const entity of entities) {
        entity.type = "ai";
        entity.lives = 50;
        entity.ammo = 500;
        entity.wallBreakerShots = 30;
        entity.mines = 12;
        entity.satelliteCharges = 1;
        placePerformanceCombatant(entity);
      }
    }
    running = true;
    clock.getDelta();
    ui.loading.classList.add("hidden");
    announce("ENGAGE", 900);
  } catch (error) {
    console.error(error);
    ui.loading.innerHTML = "ASSET-LINK FEHLER<br><small>Bitte über start_server.bat starten.</small>";
  }
}

async function startNetworkMatch(message) {
  mode = "network";
  networkPlayerId = message.playerId;
  latestNetworkSnapshot = null;
  lastNetworkEvent = 0;
  networkResultShown = false;
  networkMineQueued = false;
  networkSatelliteQueued = false;
  running = false;
  paused = false;
  matchOver = false;
  clearWorld();
  restoreWalls();
  titleMusic.fadeOut();
  ui.title.classList.add("hidden");
  ui.menu.classList.add("hidden");
  ui.lobby.classList.add("hidden");
  ui.result.classList.add("hidden");
  ui.loading.classList.remove("hidden");
  ui.mode.textContent = `ONLINE // TEAM ${message.team.toUpperCase()} // SERVER AUTHORITATIVE`;
  ui.p2.classList.remove("hidden");
  ui.divider.classList.add("hidden");
  ui.crosshair.classList.toggle("hidden", platform !== "desktop");
  ui.touch.classList.toggle("hidden", platform !== "tablet");

  const local = message.roster.find((player) => player.id === networkPlayerId);
  const orderedRoster = [
    local,
    ...message.roster.filter((player) => player.id !== networkPlayerId && player.team === local.team),
    ...message.roster.filter((player) => player.team !== local.team),
  ].filter(Boolean);

  try {
    entities = await Promise.all(orderedRoster.map(async (player) => {
      const entity = await createEntity(player.slot, player.isBot ? "ai" : "network", player.profileId);
      entity.networkId = player.id;
      entity.team = player.team;
      entity.name = player.name;
      entity.isLocal = player.id === networkPlayerId;
      return entity;
    }));
    powerups = await loadPowerups(scene, "network");
    running = true;
    clock.getDelta();
    ui.loading.classList.add("hidden");
    announce(`TEAM ${message.team.toUpperCase()} // ENGAGE`, 1100);
  } catch (error) {
    console.error(error);
    ui.loading.innerHTML = "NETZWERK-MATCH KONNTE NICHT GELADEN WERDEN";
  }
}

function collectNetworkInput() {
  const local = entities.find((entity) => entity.isLocal);
  let aimYaw = null;
  let aimPitch = null;
  if (local && platform === "desktop") {
    raycaster.setFromCamera(mouse, local.camera);
    const aim = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, aim)) {
      aimYaw = Math.atan2(aim.x - local.group.position.x, aim.z - local.group.position.z);
    }
    aimPitch = THREE.MathUtils.lerp(BARREL_MIN_PITCH, BARREL_MAX_PITCH, (mouse.y + 1) * 0.5);
  }
  return {
    throttle: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)
      + (platform === "tablet" ? touchInput.throttle : 0),
    steer: (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0)
      + (platform === "tablet" ? touchInput.steer : 0),
    turret: (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0)
      + (platform === "tablet" ? touchInput.turret : 0),
    pitch: (keys.has("KeyR") ? 1 : 0) - (keys.has("KeyF") ? 1 : 0)
      + (platform === "tablet" ? touchInput.pitch : 0),
    aimYaw,
    aimPitch,
    fire: keys.has("Space") || mouseFire || touchInput.fire || touchInput.fireQueued,
    mine: networkMineQueued,
    satellite: networkSatelliteQueued,
    sequence: ++networkInputSequence,
  };
}

function updateNetworkMatch(dt, now) {
  if (!matchOver && now >= networkInputAt) {
    networkInputAt = now + 0.05;
    const sent = networkClient.sendInput(collectNetworkInput());
    if (sent) {
      networkMineQueued = false;
      networkSatelliteQueued = false;
      touchInput.fireQueued = false;
    }
  }
  const snapshot = latestNetworkSnapshot;
  if (!snapshot) {
    entities.forEach((entity) => updateCamera(entity, dt, now));
    return;
  }

  const playerStates = new Map(snapshot.players.map((player) => [player.id, player]));
  for (const entity of entities) {
    const state = playerStates.get(entity.networkId);
    if (!state) continue;
    const smoothing = 1 - Math.exp(-dt * (entity.isLocal ? 18 : 12));
    entity.group.position.x += (state.x - entity.group.position.x) * smoothing;
    entity.group.position.z += (state.z - entity.group.position.z) * smoothing;
    entity.drive.heading = approachAngle(entity.drive.heading, state.heading, Math.PI * smoothing);
    entity.drive.speed = state.speed;
    entity.group.rotation.y = entity.drive.heading;
    entity.turretYaw = approachAngle(entity.turretYaw, state.turretYaw, Math.PI * smoothing);
    entity.barrelPitch += (state.barrelPitch - entity.barrelPitch) * smoothing;
    setTurretYaw(entity.rig, entity.turretYaw);
    setBarrelPitch(entity.rig, entity.barrelPitch);
    animateTank(entity.rig, state.speed, state.speed, dt);
    Object.assign(entity, {
      alive: state.alive,
      lives: state.lives,
      maxLives: state.maxLives,
      armor: state.armor,
      ammo: state.ammo,
      lethalShots: state.lethalShots,
      wallBreakerShots: state.wallBreakerShots,
      mines: state.mines,
      satelliteCharges: state.satelliteCharges,
      satelliteUntil: state.satelliteUntil,
      shieldType: state.shieldType,
      shieldUntil: state.shieldUntil,
      shieldHits: state.shieldHits,
      invulnerable: state.invulnerable,
      name: state.name,
    });
    entity.group.visible = state.alive;
    updateShieldVisual(entity, dt, snapshot.serverTime);
    const engineScale = entity.isLocal ? 1 : 0.32;
    gameAudio.updateEngine(entity.id, Math.min(1, Math.abs(state.speed) / 17), dt, engineScale);
  }

  syncNetworkShells(snapshot.shells);
  syncNetworkMines(snapshot.mines, now);
  syncNetworkPowerups(powerups, snapshot.powerups, dt, snapshot.serverTime);
  for (const wallIndex of snapshot.destroyedWalls) destroyWall(WALLS[wallIndex]);
  processNetworkEvents(snapshot.events);
  entities.forEach((entity) => updateCamera(entity, dt, snapshot.serverTime));
  updateParticles(dt);
  if (now >= hudRefreshAt) {
    hudRefreshAt = now + 0.2;
    updateHud(snapshot.serverTime);
  }
  if (snapshot.ended && !networkResultShown) {
    networkResultShown = true;
    matchOver = true;
    running = false;
    setTimeout(() => {
      ui.resultTitle.textContent = `TEAM ${snapshot.winner.toUpperCase()} WINS`;
      ui.result.classList.remove("hidden");
    }, 700);
  }
}

function syncNetworkShells(states) {
  const activeIds = new Set(states.map((state) => state.id));
  for (let index = shells.length - 1; index >= 0; index -= 1) {
    if (activeIds.has(shells[index].networkId)) continue;
    shellPool.release(shells[index].mesh);
    shells.splice(index, 1);
  }
  for (const state of states) {
    let shell = shells.find((candidate) => candidate.networkId === state.id);
    if (!shell) {
      const owner = entities.find((entity) => entity.networkId === state.ownerId);
      const color = state.lethal ? 0xff263b : state.wallBreaker ? 0xffb128 : owner?.accent ?? CYAN;
      shell = {
        networkId: state.id,
        mesh: shellPool.acquire(color, state.lethal ? 0.44 : state.wallBreaker ? 0.36 : 0.28),
      };
      shells.push(shell);
    }
    shell.mesh.position.set(state.x, state.y, state.z);
  }
}

function makeNetworkMine(state) {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(mineDiscGeometry, mineDiscMaterial);
  disc.position.y = 0.055;
  group.add(disc);
  const sensor = new THREE.Mesh(mineSensorGeometry, mineSensorMaterial);
  sensor.rotation.x = -Math.PI / 2;
  sensor.position.y = 0.115;
  group.add(sensor);
  group.position.set(state.x, 0, state.z);
  scene.add(group);
  return { networkId: state.id, group, sensor };
}

function syncNetworkMines(states, now) {
  const activeIds = new Set(states.map((state) => state.id));
  for (let index = mines.length - 1; index >= 0; index -= 1) {
    if (activeIds.has(mines[index].networkId)) continue;
    scene.remove(mines[index].group);
    mines.splice(index, 1);
  }
  for (const state of states) {
    let mine = mines.find((candidate) => candidate.networkId === state.id);
    if (!mine) {
      mine = makeNetworkMine(state);
      mines.push(mine);
    }
    mine.group.position.set(state.x, 0, state.z);
    mine.group.rotation.y += 0.003;
    mine.sensor.material.opacity = state.armed ? 0.055 : 0.025;
    mine.sensor.scale.setScalar(0.82 + Math.sin(now * 3) * 0.18);
  }
}

function processNetworkEvents(events) {
  for (const event of events) {
    if (event.id <= lastNetworkEvent) continue;
    lastNetworkEvent = event.id;
    const position = new THREE.Vector3(event.x ?? 0, event.y ?? 2.5, event.z ?? 0);
    if (event.type === "shot") {
      gameAudio.shot(event.playerId === networkPlayerId ? 0.95 : 0.52);
    } else if (event.type === "impact" || event.type === "shield" || event.type === "reflect") {
      burst(position, event.lethal ? 0xff263b : CYAN, 16, 12);
      gameAudio.explosion(0.44);
    } else if (event.type === "hit") {
      burst(position, event.destroyed ? 0xff8a24 : 0xffffff, event.destroyed ? 58 : 24, 20);
      gameAudio.explosion(event.destroyed ? 0.9 : 0.65);
    } else if (event.type === "mineExplosion") {
      burst(position, 0xff263b, 54, 23);
      gameAudio.explosion(0.92);
    } else if (event.type === "powerupDestroyed") {
      burst(position, POWERUP_TYPES[event.powerupType]?.color ?? CYAN, 34, 17);
      gameAudio.explosion(0.7);
    } else if (event.type === "wall") {
      const wall = WALLS[event.wallIndex];
      if (wall) shatterWall(wall, position);
    } else if (event.type === "pickup") {
      const entity = entities.find((candidate) => candidate.networkId === event.playerId);
      const label = POWERUP_TYPES[event.powerupType]?.label ?? event.powerupType.toUpperCase();
      announce(`${entity?.name ?? "PILOT"} // ${label}`, 900);
      burst(position, POWERUP_TYPES[event.powerupType]?.color ?? CYAN, 30, 14);
    } else if (event.type === "portal") {
      const entity = entities.find((candidate) => candidate.networkId === event.playerId);
      announce(`${entity?.name ?? "PILOT"} // ${event.entry.toUpperCase()} → ${event.exit.toUpperCase()}`, 800);
    } else if (event.type === "satellite" && event.playerId === networkPlayerId) {
      announce("ORBITALER UPLINK // LIVE", 1000);
    } else if (event.type === "disconnect") {
      announce(`${event.name} ÜBERNIMMT`, 1100);
    }
  }
}

function clearWorld() {
  queuedActions.clear();
  for (const entity of entities) {
    scene.remove(entity.group);
    disposeEntity(entity);
  }
  for (const shell of shells) shellPool.release(shell.mesh);
  for (const mine of mines) scene.remove(mine.group);
  particlePool.clear();
  removePowerups(scene, powerups);
  entities = [];
  shells = [];
  mines = [];
  powerups = [];
}

function disposeEntity(entity) {
  const materials = new Set();
  const geometries = new Set();
  entity.group.traverse((object) => {
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      if (material) materials.add(material);
    }
    if (object.geometry?.userData?.runtimeOwned) geometries.add(object.geometry);
  });
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function resetMatch() {
  restoreWalls();
  entities.forEach((entity) => {
    initializeCombatant(entity);
    const spawn = entity.profile.spawn;
    entity.group.position.set(spawn.x, 0, spawn.z);
    entity.drive.reset(spawn.heading);
    entity.group.rotation.y = spawn.heading;
    entity.turretYaw = 0;
    entity.barrelPitch = 0;
    setTurretYaw(entity.rig, 0);
    setBarrelPitch(entity.rig, 0);
    entity.invulnerable = 1.35;
    entity.alive = true;
    entity.respawnAt = 0;
    entity.portalReadyAt = 0;
    entity.group.visible = true;
  });
  for (const shell of shells) shellPool.release(shell.mesh);
  shells = [];
  particlePool.clear();
  updateHud();
}

function respawn(entity) {
  const spawn = entity.profile.spawn;
  restoreForRespawn(entity);
  entity.group.position.set(spawn.x, 0, spawn.z);
  entity.drive.reset(spawn.heading);
  entity.group.rotation.y = spawn.heading;
  entity.turretYaw = 0;
  entity.barrelPitch = 0;
  setTurretYaw(entity.rig, 0);
  setBarrelPitch(entity.rig, 0);
  entity.invulnerable = 1.75;
  entity.alive = true;
  entity.respawnAt = 0;
  entity.portalReadyAt = 0;
  entity.group.visible = true;
  if (PERFORMANCE_TEST_MODE) placePerformanceCombatant(entity);
  updateHud();
  announce(`${entity.name} // NEUES LEBEN`, 850);
}

function placePerformanceCombatant(entity) {
  const x = entity.id === 0 ? -14 : 14;
  const heading = entity.id === 0 ? Math.PI / 2 : -Math.PI / 2;
  entity.group.position.set(x, 0, 10);
  entity.drive.reset(heading);
  entity.group.rotation.y = heading;
  entity.turretYaw = 0;
  entity.barrelPitch = 0;
  setTurretYaw(entity.rig, 0);
  setBarrelPitch(entity.rig, 0);
}

function humanInput(entity) {
  if (mode === "ai") {
    const tablet = platform === "tablet";
    const touchFireRequested = touchInput.fire || touchInput.fireQueued;
    touchInput.fireQueued = false;
    return {
      throttle: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0)
        + (tablet ? touchInput.throttle : 0),
      steer: (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0)
        + (tablet ? touchInput.steer : 0),
      turret: tablet
        ? (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0)
          + touchInput.turret
        : 0,
      pitch: (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0)
        + (tablet ? touchInput.pitch : 0),
      fire: tablet
        ? keys.has("Space") || keys.has("Enter") || touchFireRequested
        : mouseFire,
      mouseAim: !tablet,
      mine: consumeAction("KeyM"),
      satellite: consumeAction("KeyU"),
    };
  }
  if (entity.id === 0) {
    return {
      throttle: (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0),
      steer: (keys.has("KeyA") ? 1 : 0) - (keys.has("KeyD") ? 1 : 0),
      turret: (keys.has("KeyQ") ? 1 : 0) - (keys.has("KeyE") ? 1 : 0),
      pitch: (keys.has("KeyR") ? 1 : 0) - (keys.has("KeyF") ? 1 : 0),
      fire: keys.has("Space"),
      mine: consumeAction("KeyM"),
      satellite: consumeAction("KeyU"),
    };
  }
  return {
    throttle: (keys.has("ArrowUp") ? 1 : 0) - (keys.has("ArrowDown") ? 1 : 0),
    steer: (keys.has("ArrowLeft") ? 1 : 0) - (keys.has("ArrowRight") ? 1 : 0),
    turret: (keys.has("Numpad4") || keys.has("Comma") ? 1 : 0)
      - (keys.has("Numpad6") || keys.has("Period") ? 1 : 0),
    pitch: (keys.has("Numpad8") ? 1 : 0) - (keys.has("Numpad2") ? 1 : 0),
    fire: keys.has("Enter") || keys.has("Numpad0"),
    mine: consumeAction("Numpad5"),
    satellite: consumeAction("Numpad7"),
  };
}

function consumeAction(code) {
  if (!queuedActions.has(code)) return false;
  queuedActions.delete(code);
  return true;
}

function aiInput(entity, enemy, now) {
  const dx = enemy.group.position.x - entity.group.position.x;
  const dz = enemy.group.position.z - entity.group.position.z;
  const distance = Math.hypot(dx, dz);
  const targetHeading = Math.atan2(dx, dz);
  let headingError = wrapAngle(targetHeading - entity.drive.heading);
  const ahead = {
    x: entity.group.position.x + Math.sin(entity.drive.heading) * 10,
    z: entity.group.position.z + Math.cos(entity.drive.heading) * 10,
  };
  const blockedAhead = segmentHitsWall(
    entity.group.position,
    ahead,
    queryWallsForSegment(entity.group.position, ahead, 3.1),
    3.1,
  );
  if (blockedAhead && now >= entity.aiDecisionAt) {
    entity.aiSteerBias *= -1;
    entity.aiDecisionAt = now + 0.65;
  }
  if (blockedAhead) headingError = entity.aiSteerBias * 1.4;
  const lineBlocked = segmentHitsWall(
    entity.group.position,
    enemy.group.position,
    queryWallsForSegment(entity.group.position, enemy.group.position, 0.25),
    0.25,
  );
  const deployMineNow = entity.mines > 0 && distance < 11 && now >= entity.mineDecisionAt;
  if (deployMineNow) entity.mineDecisionAt = now + 6;
  if (entity.ammo <= 0) {
    const escapeHeading = wrapAngle(targetHeading + Math.PI);
    return {
      throttle: blockedAhead ? -0.6 : 1,
      steer: Math.max(-1, Math.min(1, wrapAngle(escapeHeading - entity.drive.heading) * 1.9)),
      targetTurret: wrapAngle(targetHeading - entity.drive.heading),
      targetPitch: 0,
      fire: false,
      mine: deployMineNow,
    };
  }
  return {
    throttle: blockedAhead ? -0.45 : distance > 25 || lineBlocked ? 1 : 0.22,
    steer: Math.max(-1, Math.min(1, headingError * 1.8)),
    targetTurret: wrapAngle(targetHeading - entity.drive.heading),
    targetPitch: 0,
    fire: distance < 82 && (!lineBlocked || entity.wallBreakerShots > 0),
    mine: deployMineNow,
  };
}

function updateEntity(entity, enemy, dt, now) {
  if (!entity.alive) {
    gameAudio.updateEngine(entity.id, 0, dt, 0);
    return;
  }
  entity.invulnerable = Math.max(0, entity.invulnerable - dt);
  const previousShield = entity.shieldType;
  expireShield(entity, now);
  expireSatelliteView(entity, now);
  if (previousShield && !entity.shieldType) updateHud();
  updateShieldVisual(entity, dt, now);

  const input = entity.type === "ai" ? aiInput(entity, enemy, now) : humanInput(entity);
  if (input.mine) deployMine(entity, now);
  if (input.satellite && activateSatelliteView(entity, now)) {
    announce(`${entity.name} // ORBITALER UPLINK`, 900);
    updateHud(now);
  }
  const state = entity.drive.update(dt, input.throttle, input.steer);
  const motion = Math.min(
    1,
    Math.max(Math.abs(state.vLeft), Math.abs(state.vRight)) / entity.drive.maxSpeed,
  );
  const distanceScale = mode === "ai" && entity.id === 1
    ? Math.max(0, 1 - entity.group.position.distanceTo(enemy.group.position) / 90) * 0.55
    : mode === "local" ? 0.68 : 1;
  gameAudio.updateEngine(entity.id, motion, dt, distanceScale);
  const previous = entity.group.position.clone();
  entity.group.position.x += state.dx;
  entity.group.position.z += state.dz;
  const resolved = resolveWalls(
    entity.group.position,
    3.05,
    queryWallsNear(entity.group.position, 3.1),
  );
  entity.group.position.set(resolved.x, 0, resolved.z);
  if (Math.hypot(previous.x - resolved.x, previous.z - resolved.z) < 0.001 && Math.abs(input.throttle) > 0) {
    entity.drive.speed *= 0.88;
  }
  entity.group.rotation.y = entity.drive.heading;
  updatePortalTraversal(entity, now);
  animateTank(entity.rig, state.vLeft, state.vRight, dt);

  if (input.mouseAim) {
    raycaster.setFromCamera(mouse, entity.camera);
    const aim = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(groundPlane, aim)) {
      const target = Math.atan2(
        aim.x - entity.group.position.x,
        aim.z - entity.group.position.z,
      ) - entity.drive.heading;
      entity.turretYaw = approachAngle(entity.turretYaw, target, dt * 3.4);
    }
    if (soloPitchInput === "mouse") {
      const targetPitch = THREE.MathUtils.lerp(
        BARREL_MIN_PITCH,
        BARREL_MAX_PITCH,
        (mouse.y + 1) * 0.5,
      );
      const pitchStep = dt * 0.72;
      entity.barrelPitch += THREE.MathUtils.clamp(
        targetPitch - entity.barrelPitch,
        -pitchStep,
        pitchStep,
      );
    } else {
      entity.barrelPitch = THREE.MathUtils.clamp(
        entity.barrelPitch + input.pitch * dt * 0.62,
        BARREL_MIN_PITCH,
        BARREL_MAX_PITCH,
      );
    }
  } else if (entity.type === "ai") {
    entity.turretYaw = approachAngle(entity.turretYaw, input.targetTurret, dt * 2.6);
    entity.barrelPitch += THREE.MathUtils.clamp(
      input.targetPitch - entity.barrelPitch,
      -dt * 0.5,
      dt * 0.5,
    );
  } else {
    entity.turretYaw = wrapAngle(entity.turretYaw + input.turret * dt * 1.85);
    entity.barrelPitch = THREE.MathUtils.clamp(
      entity.barrelPitch + input.pitch * dt * 0.62,
      BARREL_MIN_PITCH,
      BARREL_MAX_PITCH,
    );
  }
  setTurretYaw(entity.rig, entity.turretYaw);
  setBarrelPitch(entity.rig, entity.barrelPitch);

  const aimError = entity.type === "ai"
    ? Math.abs(wrapAngle(input.targetTurret - entity.turretYaw)) : 0;
  if (input.fire && aimError < 0.12) fire(entity, now);
}

function updatePortalTraversal(entity, now) {
  if (now < entity.portalReadyAt) return;
  const entry = findEnteredPortal(entity.group.position, 0.3);
  if (!entry) return;
  const exit = choosePortalExit(entry.id);
  const entryBurst = entity.group.position.clone().setY(3.2);
  burst(entryBurst, entry.color, 38, 18);
  entity.group.position.set(exit.exitX, 0, exit.exitZ);
  entity.drive.reset(exit.heading);
  entity.group.rotation.y = exit.heading;
  entity.invulnerable = Math.max(entity.invulnerable, 0.7);
  entity.portalReadyAt = now + 1.2;
  burst(entity.group.position.clone().setY(3.2), exit.color, 48, 21);
  gameAudio.explosion(0.42);
  announce(`${entity.name} // ${entry.id.toUpperCase()} → ${exit.id.toUpperCase()}`, 850);
}

function animatePortals(dt, now) {
  for (let index = 0; index < portalVisuals.length; index += 1) {
    const portal = portalVisuals[index];
    const surface = portal.getObjectByName("PortalSurface");
    const motes = portal.getObjectByName("PortalMotes");
    surface.material.opacity = 0.12 + Math.sin(now * 2.4 + index) * 0.045;
    motes.rotation.z += dt * (index % 2 ? -0.52 : 0.52);
    const pulse = 1 + Math.sin(now * 1.7 + index * 0.8) * 0.018;
    motes.scale.setScalar(pulse);
  }
}

function fire(entity, now) {
  if (entity.ammo <= 0) {
    if (now >= entity.emptyNoticeAt) {
      entity.emptyNoticeAt = now + 1.2;
      announce(`${entity.name} // MUNITION LEER`, 700);
    }
    return;
  }
  if (!entity.weapon.tryFire(now)) return;
  const lethal = entity.lethalShots > 0;
  const wallBreaker = !lethal && entity.wallBreakerShots > 0;
  if (lethal) entity.lethalShots -= 1;
  if (wallBreaker) entity.wallBreakerShots -= 1;
  entity.ammo -= 1;
  updateHud();
  const yaw = entity.drive.heading + entity.turretYaw;
  const shotDirection = aimDirection(yaw, entity.barrelPitch);
  const direction = new THREE.Vector3(shotDirection.x, shotDirection.y, shotDirection.z);
  const position = entity.group.position.clone()
    .add(new THREE.Vector3(0, 3.1, 0))
    .addScaledVector(direction, 6.6);
  const shotColor = lethal ? 0xff263b : wallBreaker ? 0xffb128 : entity.accent;
  const mesh = shellPool.acquire(
    shotColor,
    lethal ? 0.44 : wallBreaker ? 0.36 : 0.28,
  );
  mesh.position.copy(position);
  shells.push({
    owner: entity,
    mesh,
    velocity: direction.multiplyScalar(58),
    life: 2.1,
    reflections: 0,
    lethal,
    wallBreaker,
  });
  burst(position, shotColor, lethal || wallBreaker ? 22 : 8, lethal || wallBreaker ? 12 : 7);
  const shotVolume = mode === "ai" && entity.id !== 0 ? 0.62 : 1;
  gameAudio.shot(shotVolume);
}

function deployMine(entity, now) {
  if (entity.mines <= 0) return;
  const deployedCount = mines.filter((mine) => mine.owner === entity).length;
  if (deployedCount >= MAX_DEPLOYED_MINES_PER_PLAYER) {
    announce(`${entity.name} // MAXIMAL ${MAX_DEPLOYED_MINES_PER_PLAYER} MINEN AKTIV`, 700);
    return;
  }
  entity.mines -= 1;
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    mineDiscGeometry,
    mineDiscMaterial,
  );
  disc.position.y = 0.055;
  group.add(disc);
  const sensor = new THREE.Mesh(
    mineSensorGeometry,
    mineSensorMaterial,
  );
  sensor.name = "MineSensor";
  sensor.rotation.x = -Math.PI / 2;
  sensor.position.y = 0.115;
  group.add(sensor);
  group.position.copy(entity.group.position);
  group.position.y = 0;
  scene.add(group);
  mines.push({
    owner: entity,
    group,
    sensor,
    armedAt: now + 1.1,
    expiresAt: now + MINE_LIFETIME,
    phase: Math.random() * Math.PI * 2,
  });
  updateHud();
  announce(`${entity.name} // MINE GELEGT · ${entity.mines} ÜBRIG`, 650);
}

function updateMines(dt, now) {
  for (let index = mines.length - 1; index >= 0; index -= 1) {
    const mine = mines[index];
    mine.group.rotation.y += dt * 0.08;
    const pulse = now >= mine.armedAt
      ? 0.82 + Math.sin(now * 3 + mine.phase) * 0.18
      : 0.55;
    mine.sensor.scale.setScalar(pulse);
    if (now >= mine.expiresAt) {
      scene.remove(mine.group);
      mines.splice(index, 1);
      continue;
    }
    if (now < mine.armedAt) continue;
    const target = entities.find((entity) => (
      entity !== mine.owner
      && entity.alive
      && entity.invulnerable <= 0
      && circlesOverlap(entity.group.position, 3.05, mine.group.position, 1.25)
    ));
    if (!target) continue;
    scene.remove(mine.group);
    mines.splice(index, 1);
    const blast = mine.group.position.clone().setY(0.4);
    burst(blast, 0xff263b, 50, 23);
    burst(blast, 0xffb128, 36, 17);
    gameAudio.explosion(0.92);
    damage(target, mine.owner, now, 60);
  }
}

function shatterWall(wall, impactPosition) {
  const fragmentCount = Math.min(96, Math.max(42, Math.round((wall.hw + wall.hd) * 2.2)));
  for (let index = 0; index < fragmentCount; index += 1) {
    const position = new THREE.Vector3(
      wall.x + (Math.random() * 2 - 1) * wall.hw,
      0.2 + Math.random() * WALL_HEIGHT,
      wall.z + (Math.random() * 2 - 1) * wall.hd,
    );
    const away = position.clone().sub(impactPosition).setY(0).normalize();
    const velocity = away.multiplyScalar(5 + Math.random() * 11);
    velocity.y = 5 + Math.random() * 13;
    particlePool.spawn({
      position,
      velocity,
      color: index % 4 === 0 ? 0xffb128 : index % 3 === 0 ? MAGENTA : CYAN,
      life: 0.7 + Math.random() * 0.8,
      scale: [
        0.18 + Math.random() * 0.36,
        0.18 + Math.random() * 0.54,
        0.18 + Math.random() * 0.36,
      ],
    });
  }
  burst(impactPosition, 0xffffff, 34, 20);
  announce("MAUER ZERSTÖRT", 700);
}

function updateShells(dt, now) {
  for (let index = shells.length - 1; index >= 0; index -= 1) {
    const shell = shells[index];
    shell.life -= dt;
    shell.mesh.position.addScaledVector(shell.velocity, dt);
    const hitWall = shell.mesh.position.y <= WALL_HEIGHT
      ? findWallHit(shell.mesh.position, queryWallsNear(shell.mesh.position, 0.3), 0.2)
      : null;
    const hitGround = shell.mesh.position.y < 0;
    let destroyed = shell.life <= 0
      || shell.mesh.position.y < 0
      || shell.mesh.position.y > 38
      || Boolean(hitWall);
    if ((hitWall || hitGround) && shell.life > 0) {
      if (hitWall && shell.wallBreaker && destroyWall(hitWall)) {
        shatterWall(hitWall, shell.mesh.position);
      } else {
        const color = shell.lethal ? 0xff263b : shell.wallBreaker ? 0xffb128 : shell.owner.accent;
        burst(shell.mesh.position, color, shell.lethal || shell.wallBreaker ? 28 : 10, 12);
      }
      gameAudio.explosion(0.52);
    }
    for (const target of entities) {
      if (destroyed || target === shell.owner || !target.alive || target.invulnerable > 0) continue;
      const targetCenter = target.group.position.clone().add(new THREE.Vector3(0, 2.6, 0));
      if (shell.mesh.position.distanceTo(targetCenter) > 3.25) continue;
      const outcome = hitTank(target, shell, now);
      destroyed = outcome === "absorbed" || outcome === "damaged";
      if (outcome === "reflected") break;
    }
    if (!destroyed) {
      for (const powerup of powerups) {
        if (!powerup.active) continue;
        if (shell.mesh.position.distanceTo(powerup.group.position) > POWERUP_HIT_RADIUS) continue;
        explodePowerup(powerup, now);
        destroyed = true;
        break;
      }
    }
    if (destroyed) {
      shellPool.release(shell.mesh);
      shells.splice(index, 1);
    }
  }
}

function hitTank(target, shell, now) {
  if (shell.lethal) {
    if (target.shieldType) {
      target.shieldType = null;
      target.shieldUntil = 0;
      target.shieldHits = 0;
      burst(shell.mesh.position, 0xffffff, 42, 22);
      burst(shell.mesh.position, 0xff263b, 38, 18);
      const result = damage(target, shell.owner, now, 50, true);
      if (!result.destroyed) {
        announce(`${target.name} // SCHILD ZERSTÖRT · ${target.armor}% ENERGIE`, 1100);
      }
      updateHud();
      return "damaged";
    }
    damage(target, shell.owner, now, 100);
    return "damaged";
  }
  if (target.shieldType) {
    const shieldType = target.shieldType;
    const shieldStillActive = target.shieldHits > 1;
    absorbShieldHit(target);
    burst(shell.mesh.position, shieldType === "reflect" ? 0xff5cff : 0x39fff2, 28, 15);
    gameAudio.explosion(0.58);
    if (shieldType === "reflect" && shell.reflections < 4) {
      const returnTarget = shell.owner;
      const targetPoint = returnTarget.group.position.clone().add(new THREE.Vector3(0, 2.5, 0));
      shell.velocity.copy(targetPoint.sub(shell.mesh.position).normalize().multiplyScalar(62));
      shell.owner = target;
      shell.life = Math.max(shell.life, 2.1);
      shell.reflections += 1;
      shell.mesh.material = shellPool.material(0xff5cff);
      announce(`${target.name} // REFLEKTION ${shieldStillActive ? target.shieldHits : 0}/5`, 650);
      updateHud();
      return "reflected";
    }
    announce(`${target.name} // SCHILD ${shieldStillActive ? target.shieldHits : 0}/5`, 650);
    updateHud();
    return "absorbed";
  }
  damage(target, shell.owner, now);
  return "damaged";
}

function damage(target, attacker, now, amount, suppressHitAnnounce = false) {
  const result = applyHit(target, amount);
  target.invulnerable = 0.42;
  burst(target.group.position.clone().setY(2.2), target.accent, 24, 17);
  gameAudio.explosion(result.destroyed ? 0.95 : 0.72);
  if (!result.destroyed) {
    if (!suppressHitAnnounce) announce(`${target.name} // ${target.armor}% ENERGIE`, 650);
    updateHud();
    return result;
  }
  target.alive = false;
  target.group.visible = false;
  attacker.score += 1;
  spectacularExplosion(target.group.position.clone().setY(2.4), target.accent);
  updateHud();
  if (result.eliminated) {
    matchOver = true;
    running = false;
    setTimeout(() => showResult(attacker), 700);
  } else {
    announce(`${target.name} // LEBEN VERLOREN`, 1200);
    target.respawnAt = now + 2.25;
  }
  return result;
}

function spectacularExplosion(position, color) {
  burst(position, 0xffffff, 42, 30);
  burst(position, color, 64, 23);
  burst(position, 0xff8a24, 36, 18);
  for (let index = 0; index < 3; index += 1) {
    particlePool.spawn({
      position,
      velocity: new THREE.Vector3(0, 0.4 + index * 0.2, 0),
      color: index === 0 ? 0xffffff : color,
      life: 0.45 + index * 0.12,
      scale: [0.9, 0.08, 0.9],
      gravity: 0,
      grow: 12 + index * 4,
    });
  }
}

function resolveTankCollision() {
  const [a, b] = entities;
  if (!a?.alive || !b?.alive) return;
  const dx = b.group.position.x - a.group.position.x;
  const dz = b.group.position.z - a.group.position.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= 0.001 || distance >= 6.1) return;
  const push = (6.1 - distance) / 2;
  const nx = dx / distance;
  const nz = dz / distance;
  a.group.position.x -= nx * push;
  a.group.position.z -= nz * push;
  b.group.position.x += nx * push;
  b.group.position.z += nz * push;
  a.drive.speed *= 0.45;
  b.drive.speed *= 0.45;
}

function burst(position, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const direction = new THREE.Vector3(
      Math.random() - 0.5,
      Math.random() * 0.9,
      Math.random() - 0.5,
    ).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
    particlePool.spawn({
      position,
      velocity: direction,
      color,
      life: 0.35 + Math.random() * 0.55,
      scale: [0.09, 0.09, 0.38],
    });
  }
}

function updateParticles(dt) {
  particlePool.update(dt);
}

function collectPowerups(now) {
  for (const powerup of powerups) {
    if (!powerup.active) continue;
    for (const entity of entities) {
      if (!entity.alive || !circlesOverlap(
        entity.group.position,
        3.05,
        powerup.group.position,
        2.4,
      )) continue;
      if (!applyPowerup(entity, powerup, now)) continue;
      consumePowerup(powerup, now);
      burst(powerup.group.position.clone(), powerup.config.color, 34, 14);
      updateHud();
      break;
    }
  }
}

function applyPowerup(entity, powerup, now) {
  switch (powerup.type) {
    case "health":
      if (entity.armor >= 100) return false;
      healArmor(entity);
      break;
    case "life":
      grantLife(entity);
      break;
    case "ammo":
      grantAmmo(entity);
      break;
    case "shield":
      activateShield(entity, "normal", now);
      break;
    case "reflect":
      activateShield(entity, "reflect", now);
      break;
    case "lethal":
      if (!grantLethalShot(entity)) return false;
      break;
    case "hammer":
      grantWallBreakerShots(entity);
      break;
    case "mine":
      grantMines(entity);
      break;
    case "satellite":
      if (!grantSatelliteCharge(entity)) return false;
      break;
    default:
      return false;
  }
  announce(`${entity.name} // ${powerup.config.label}`, 950);
  return true;
}

function explodePowerup(powerup, now) {
  const position = powerup.group.position.clone();
  burst(position, 0xffffff, 18, 22);
  burst(position, powerup.config.color, 32, 14);
  gameAudio.explosion(0.7);
  consumePowerup(powerup, now);
}

function updateCamera(entity, dt, now = performance.now() / 1000) {
  const yaw = entity.drive.heading;
  const chasePosition = entity.group.position.clone().add(new THREE.Vector3(
    -Math.sin(yaw) * 14,
    8.4,
    -Math.cos(yaw) * 14,
  ));
  const chaseTarget = new THREE.Vector3(
    entity.group.position.x + Math.sin(yaw) * 4,
    2.1,
    entity.group.position.z + Math.cos(yaw) * 4,
  );
  const satelliteActive = entity.satelliteUntil > 0 && now < entity.satelliteUntil;
  const blendTarget = satelliteActive ? 1 : 0;
  const blendSmoothing = 1 - Math.exp(-dt * (satelliteActive ? 2.8 : 2.3));
  entity.satelliteBlend += (blendTarget - entity.satelliteBlend) * blendSmoothing;
  if (Math.abs(entity.satelliteBlend - blendTarget) < 0.001) {
    entity.satelliteBlend = blendTarget;
  }
  const blend = entity.satelliteBlend * entity.satelliteBlend * (3 - 2 * entity.satelliteBlend);
  const orbitalPosition = new THREE.Vector3(0, 650, 0.1);
  const desired = chasePosition.clone().lerp(orbitalPosition, blend);
  const lookTarget = chaseTarget.clone().lerp(new THREE.Vector3(0, 0, 0), blend);
  const smoothing = 1 - Math.exp(-dt * (satelliteActive ? 4.8 : 6.2));
  entity.camera.position.lerp(desired, smoothing);
  const desiredUp = new THREE.Vector3(0, 1 - blend, -blend).normalize();
  entity.camera.up.lerp(desiredUp, 1 - Math.exp(-dt * 4)).normalize();
  entity.camera.fov = THREE.MathUtils.lerp(62, 64, blend);
  entity.camera.lookAt(lookTarget);
}

function render() {
  const activeViewers = mode === "local" ? entities.slice(0, 2) : entities.slice(0, 1);
  const satelliteVisible = activeViewers.some((entity) => entity.satelliteBlend > 0.08);
  ui.satelliteOverlay.classList.toggle("active", satelliteVisible);
  const usesCrosshair = running && (mode === "ai" || (mode === "network" && platform === "desktop"));
  ui.crosshair.classList.toggle("hidden", !usesCrosshair || satelliteVisible);
  renderer.setScissorTest(true);
  renderer.clear();
  if (mode === "local" && entities.length === 2) {
    const half = Math.floor(innerWidth / 2);
    renderView(entities[0], 0, 0, half, innerHeight);
    renderView(entities[1], half, 0, innerWidth - half, innerHeight);
  } else if (entities[0]) {
    renderView(entities[0], 0, 0, innerWidth, innerHeight);
  }
  renderer.setScissorTest(false);
}

function renderView(entity, x, y, width, height) {
  const blend = entity.satelliteBlend;
  for (const candidate of entities) {
    const marker = candidate.tacticalMarker;
    marker.visible = blend > 0.12 && candidate.alive;
    if (!marker.visible) continue;
    const sameTeam = mode === "network"
      ? candidate.team === entity.team
      : candidate === entity;
    const color = candidate === entity ? 0xffffff : sameTeam ? 0x39ff88 : 0xff3048;
    const markerOpacity = Math.min(0.95, blend * 1.2);
    for (const { material, opacityScale } of marker.userData.colorMaterials) {
      material.color.setHex(color);
      material.opacity = markerOpacity * opacityScale;
    }
    marker.userData.turretSymbol.rotation.y = candidate.turretYaw;
    marker.rotation.y = 0;
    const pulseOffset = Number(candidate.id) || 0;
    marker.scale.setScalar(1 + Math.sin(performance.now() * 0.004 + pulseOffset) * 0.045);
  }
  entity.camera.aspect = width / height;
  entity.camera.updateProjectionMatrix();
  renderer.setViewport(x, y, width, height);
  renderer.setScissor(x, y, width, height);
  const previousFog = scene.fog.density;
  const previousExposure = renderer.toneMappingExposure;
  scene.fog.density = THREE.MathUtils.lerp(0.007, 0.00045, blend);
  renderer.toneMappingExposure = THREE.MathUtils.lerp(1.4, 1.72, blend);
  renderer.render(scene, entity.camera);
  scene.fog.density = previousFog;
  renderer.toneMappingExposure = previousExposure;
  for (const candidate of entities) candidate.tacticalMarker.visible = false;
}

function updateHud(now = performance.now() / 1000) {
  if (entities.length < 2) return;
  const tankSvg = `
    <svg viewBox="0 0 34 20" aria-hidden="true">
      <path d="M4 13h26l-2 5H6zM9 7h15l4 6H6zM13 3h9v4h-9zM21 4h10v2H21z"/>
    </svg>`;
  const lifeIcons = (entity) => Array.from({ length: entity.maxLives }, (_, index) => {
    const active = index < entity.lives;
    const current = active && index === entity.lives - 1;
    return `<i class="life ${active ? "active" : ""} ${current ? "current" : ""}">${tankSvg}</i>`;
  }).join("");
  const shield = (entity) => {
    if (!entity.shieldType) return "";
    const remaining = Math.max(0, Math.ceil(entity.shieldUntil - now));
    const label = entity.shieldType === "reflect" ? "SPIEGEL" : "SCHILD";
    return `<em class="${entity.shieldType}">${label} ${remaining}s · ${entity.shieldHits} TREFFER</em>`;
  };
  const content = (entity) => `
    <div class="hud-heading"><strong>${entity.name}</strong><b>${entity.armor}%</b></div>
    <div class="lives">${lifeIcons(entity)}</div>
    <div class="armor"><i style="width:${entity.armor}%"></i></div>
    <div class="resources">
      <span class="${entity.ammo ? "" : "empty"}">MUNITION ${entity.ammo}</span>
      ${shield(entity)}
      ${entity.lethalShots ? '<em class="lethal">☠ TÖDLICHER SCHUSS BEREIT</em>' : ""}
      ${entity.wallBreakerShots ? `<em class="breaker">⚒ MAUERBRECHER ${entity.wallBreakerShots}</em>` : ""}
      ${entity.mines ? `<em class="mines">MINEN ${entity.mines} · M</em>` : ""}
      ${entity.satelliteCharges ? '<em class="satellite">◉ SATELLIT 1 · U</em>' : ""}
      ${entity.satelliteUntil > now ? `<em class="satellite">ORBITAL ${Math.ceil(entity.satelliteUntil - now)}s</em>` : ""}
    </div>`;
  ui.p1.style.setProperty("--tank-accent", `#${entities[0].accent.toString(16).padStart(6, "0")}`);
  ui.p2.style.setProperty("--tank-accent", `#${entities[1].accent.toString(16).padStart(6, "0")}`);
  ui.p1.innerHTML = content(entities[0]);
  ui.p2.innerHTML = content(entities[1]);
}

function announce(text, duration) {
  ui.announce.textContent = text;
  ui.announce.classList.remove("hidden");
  clearTimeout(announce.timeout);
  announce.timeout = setTimeout(() => ui.announce.classList.add("hidden"), duration);
}

function showResult(winner) {
  ui.resultTitle.textContent = `${winner.name} WINS`;
  ui.result.classList.remove("hidden");
}

function showMenu() {
  if (mode === "network") networkClient.leave();
  running = false;
  matchOver = false;
  gameAudio.stop();
  clearWorld();
  latestNetworkSnapshot = null;
  ui.result.classList.add("hidden");
  ui.title.classList.add("hidden");
  ui.lobby.classList.add("hidden");
  ui.menu.classList.remove("hidden");
  titleMusic.play();
  ui.p1.innerHTML = "";
  ui.p2.innerHTML = "";
  ui.divider.classList.add("hidden");
  ui.crosshair.classList.add("hidden");
  ui.touch.classList.add("hidden");
  Object.assign(touchInput, {
    throttle: 0,
    steer: 0,
    turret: 0,
    pitch: 0,
    fire: false,
    fireQueued: false,
  });
}

function togglePause() {
  paused = !paused;
  running = !paused;
  announce(paused ? "PAUSED" : "RESUME", paused ? 999999 : 600);
  if (running) clock.getDelta();
}

function performanceSnapshot() {
  let sceneObjects = 0;
  scene.traverse(() => { sceneObjects += 1; });
  return {
    fps: Number(measuredFps.toFixed(1)),
    sceneObjects,
    particles: particlePool.count,
    particleCapacity: particlePool.capacity,
    shells: shells.length,
    pooledShells: shellPool.available.length,
    mines: mines.length,
    destroyedWalls: WALLS.filter((wall) => wall.destroyed).length,
    renderCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
    heapMB: performance.memory
      ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1))
      : null,
    performanceTest: PERFORMANCE_TEST_MODE,
  };
}

const diagnosticsOutput = document.createElement("output");
diagnosticsOutput.id = "performance-diagnostics";
diagnosticsOutput.hidden = true;
document.body.appendChild(diagnosticsOutput);
if (PERFORMANCE_TEST_MODE) {
  const satelliteTestButton = document.createElement("button");
  satelliteTestButton.id = "satellite-test-trigger";
  satelliteTestButton.textContent = "SATELLIT TESTEN";
  satelliteTestButton.style.cssText = "position:fixed;right:14px;bottom:14px;z-index:30;padding:10px";
  satelliteTestButton.addEventListener("click", () => {
    const player = entities[0];
    if (!player) return;
    player.satelliteCharges = Math.max(1, player.satelliteCharges);
    activateSatelliteView(player, performance.now() / 1000);
    updateHud();
  });
  document.body.appendChild(satelliteTestButton);
}
window.__tankWarsDiagnostics = { snapshot: performanceSnapshot };

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.04);
  const now = performance.now() / 1000;
  performanceFrames += 1;
  const sampleElapsed = performance.now() - performanceSampleAt;
  if (sampleElapsed >= 1000) {
    measuredFps = performanceFrames * 1000 / sampleElapsed;
    performanceFrames = 0;
    performanceSampleAt = performance.now();
    diagnosticsOutput.value = JSON.stringify(performanceSnapshot());
  }
  stars.rotation.y += dt * 0.004;
  animatePortals(dt, now);
  if (mode === "network" && entities.length === 4) {
    updateNetworkMatch(dt, now);
  } else if (running && entities.length === 2) {
    if (PERFORMANCE_TEST_MODE) {
      for (const entity of entities) {
        entity.maxLives = 3;
        entity.lives = Math.max(entity.lives, 40);
        if (entity.ammo < 400) entity.ammo = 500;
        if (entity.wallBreakerShots < 20) entity.wallBreakerShots = 30;
        if (entity.mines < 6) entity.mines = 12;
      }
    }
    const occupiedPositions = entities
      .filter((entity) => entity.alive)
      .map((entity) => entity.group.position);
    updatePowerupVisuals(powerups, dt, now, occupiedPositions);
    for (const entity of entities) {
      if (!entity.alive && entity.lives > 0 && entity.respawnAt && now >= entity.respawnAt) respawn(entity);
    }
    updateEntity(entities[0], entities[1], dt, now);
    updateEntity(entities[1], entities[0], dt, now);
    resolveTankCollision();
    updateShells(dt, now);
    updateMines(dt, now);
    collectPowerups(now);
    updateParticles(dt);
    entities.forEach((entity) => updateCamera(entity, dt, now));
    if (now >= hudRefreshAt) {
      hudRefreshAt = now + 0.5;
      updateHud(now);
    }
  } else {
    updatePowerupVisuals(
      powerups,
      dt,
      now,
      entities.filter((entity) => entity.alive).map((entity) => entity.group.position),
    );
    gameAudio.silence(dt);
    updateParticles(dt);
    entities.forEach((entity) => updateCamera(entity, dt, now));
  }
  render();
  pressedKeys.clear();
}

loop();
