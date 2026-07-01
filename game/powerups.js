import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  ARENA_SIZE,
  ARENA_SECTOR_SIZE,
  queryWallsNear,
} from "./arena.js?v=20260630-performance1";
import { expandPowerupPool } from "./powerup-config.js?v=20260630-satellite1";
import { assetUrl } from "./asset-url.js?v=20260630-deploy1";

export const POWERUP_TYPES = Object.freeze({
  health: Object.freeze({
    label: "+50% ENERGIE",
    color: 0x39ff88,
    url: assetUrl("./assets/powerups/health.glb"),
  }),
  life: Object.freeze({
    label: "+1 LEBEN",
    color: 0x15e7ff,
    url: assetUrl("./assets/powerups/life.glb"),
  }),
  ammo: Object.freeze({
    label: "+5 MUNITION",
    color: 0xffa21f,
    url: assetUrl("./assets/powerups/ammo.glb"),
  }),
  shield: Object.freeze({
    label: "AEGIS-SCHILD",
    color: 0x39fff2,
    url: assetUrl("./assets/powerups/shield.glb"),
  }),
  reflect: Object.freeze({
    label: "SPIEGELSCHILD",
    color: 0xff5cff,
    url: assetUrl("./assets/powerups/reflect.glb"),
  }),
  lethal: Object.freeze({
    label: "TÖDLICHER SCHUSS",
    color: 0xff263b,
    url: assetUrl("./assets/powerups/lethal.glb"),
    initialDelay: [25, 45],
    respawnDelay: [70, 110],
  }),
  hammer: Object.freeze({
    label: "+3 MAUERBRECHER",
    color: 0xffb128,
    url: assetUrl("./assets/powerups/hammer.glb"),
  }),
  mine: Object.freeze({
    label: "+3 MINEN",
    color: 0xff493d,
    url: assetUrl("./assets/powerups/mine.glb"),
  }),
  satellite: Object.freeze({
    label: "SATELLITENSICHT",
    color: 0x8de8ff,
    url: null,
    initialDelay: [35, 65],
    respawnDelay: [90, 140],
  }),
});

const loader = new GLTFLoader();
const templatePromises = new Map();
const ARENA_LIMIT = ARENA_SIZE / 2 - 8;
const PICKUP_CLEARANCE = 5.2;
const PICKUP_SEPARATION = 13;
const TANK_SEPARATION = 15;
const HIDDEN_Y = -2.65;
const RESTING_Y = 2.45;
const SPAWN_DELAY_MIN = 9;
const SPAWN_DELAY_MAX = 20;
const MAX_ACTIVE_PER_SECTOR = 2;

function makePedestal(color) {
  const group = new THREE.Group();
  const ringGeometry = new THREE.TorusGeometry(2.25, 0.055, 8, 48);
  ringGeometry.userData.disposable = true;
  const ring = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -2.35;
  group.add(ring);
  return group;
}

function disposable(geometry) {
  geometry.userData.disposable = true;
  return geometry;
}

function makeSatelliteModel() {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    disposable(new THREE.BoxGeometry(1.5, 1.5, 1.5)),
    new THREE.MeshPhysicalMaterial({
      color: 0x071b28,
      emissive: 0x164f66,
      emissiveIntensity: 1.4,
      metalness: 0.72,
      roughness: 0.22,
      transparent: true,
      opacity: 0.88,
    }),
  );
  group.add(shell);
  const edges = new THREE.LineSegments(
    disposable(new THREE.EdgesGeometry(shell.geometry)),
    new THREE.LineBasicMaterial({
      color: 0x8de8ff,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    }),
  );
  group.add(edges);

  const orbit = new THREE.Mesh(
    disposable(new THREE.TorusGeometry(1.02, 0.035, 8, 48)),
    new THREE.MeshBasicMaterial({ color: 0x8de8ff, toneMapped: false }),
  );
  orbit.rotation.x = Math.PI / 2;
  group.add(orbit);

  const satellite = new THREE.Group();
  const body = new THREE.Mesh(
    disposable(new THREE.CylinderGeometry(0.16, 0.16, 0.56, 12)),
    new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }),
  );
  body.rotation.z = Math.PI / 2;
  satellite.add(body);
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(
      disposable(new THREE.BoxGeometry(0.62, 0.06, 0.34)),
      new THREE.MeshBasicMaterial({ color: 0x15e7ff, toneMapped: false }),
    );
    panel.position.x = side * 0.52;
    satellite.add(panel);
  }
  const dish = new THREE.Mesh(
    disposable(new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)),
    new THREE.MeshBasicMaterial({
      color: 0xfff6cf,
      wireframe: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
  );
  dish.position.y = 0.28;
  dish.rotation.x = Math.PI;
  satellite.add(dish);
  satellite.position.y = 0.1;
  satellite.rotation.y = -0.35;
  group.add(satellite);
  return group;
}

export async function loadPowerups(scene, preset = "local") {
  const pool = expandPowerupPool(preset);
  const entries = await Promise.all(pool.map(async ({ id, type }) => {
    const config = POWERUP_TYPES[type];
    const group = new THREE.Group();
    let model;
    if (config.url) {
      if (!templatePromises.has(config.url)) {
        templatePromises.set(config.url, loader.loadAsync(config.url));
      }
      const gltf = await templatePromises.get(config.url);
      model = gltf.scene.clone(true);
    } else {
      model = makeSatelliteModel();
    }
    model.scale.setScalar(2.2);
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      if (Array.isArray(object.material)) {
        object.material = object.material.map((material) => material.clone());
      } else if (object.material) {
        object.material = object.material.clone();
      }
    });
    group.add(model, makePedestal(config.color));
    group.position.y = HIDDEN_Y;
    group.visible = false;
    scene.add(group);
    const initialDelay = config.initialDelay ?? [0.25, 5];
    return {
      id,
      type,
      config,
      group,
      active: false,
      state: "waiting",
      respawnAt: performance.now() / 1000 + randomBetween(...initialDelay),
      spawnStartedAt: 0,
      spawnDuration: 0,
      phase: Math.random() * Math.PI * 2,
      materials: collectMaterials(group),
      lights: collectLights(group),
    };
  }));
  entries.forEach((powerup) => setFade(powerup, 0));
  return entries;
}

function collectMaterials(root) {
  const materials = [];
  root.traverse((object) => {
    if (!object.material) return;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials) {
      materials.push({
        material,
        opacity: material.opacity ?? 1,
        transparent: material.transparent,
        depthWrite: material.depthWrite,
      });
    }
  });
  return materials;
}

function collectLights(root) {
  const lights = [];
  root.traverse((object) => {
    if (object.isLight) lights.push({ light: object, intensity: object.intensity });
  });
  return lights;
}

function setFade(powerup, alpha) {
  for (const item of powerup.materials) {
    item.material.transparent = true;
    item.material.opacity = item.opacity * alpha;
    item.material.depthWrite = alpha >= 0.92 ? item.depthWrite : false;
  }
  for (const item of powerup.lights) item.light.intensity = item.intensity * alpha;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function isOpenPosition(x, z, powerup, powerups, occupiedPositions) {
  if (queryWallsNear({ x, z }, PICKUP_CLEARANCE).some((wall) => (
    Math.abs(x - wall.x) <= wall.hw + PICKUP_CLEARANCE
    && Math.abs(z - wall.z) <= wall.hd + PICKUP_CLEARANCE
  ))) return false;
  if (powerups.some((other) => (
    other !== powerup
    && other.state !== "waiting"
    && Math.hypot(x - other.group.position.x, z - other.group.position.z) < PICKUP_SEPARATION
  ))) return false;
  const sectorX = Math.floor((x + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE);
  const sectorZ = Math.floor((z + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE);
  const sectorPopulation = powerups.filter((other) => (
    other !== powerup
    && other.state !== "waiting"
    && Math.floor((other.group.position.x + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE) === sectorX
    && Math.floor((other.group.position.z + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE) === sectorZ
  )).length;
  if (sectorPopulation >= MAX_ACTIVE_PER_SECTOR) return false;
  return !occupiedPositions.some((position) => (
    Math.hypot(x - position.x, z - position.z) < TANK_SEPARATION
  ));
}

function randomSpawnPosition(powerup, powerups, occupiedPositions) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const x = randomBetween(-ARENA_LIMIT, ARENA_LIMIT);
    const z = randomBetween(-ARENA_LIMIT, ARENA_LIMIT);
    if (isOpenPosition(x, z, powerup, powerups, occupiedPositions)) return { x, z };
  }
  // Relax only the distance to other objects after unusually unlucky samples;
  // walls and arena bounds remain non-negotiable.
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const x = randomBetween(-ARENA_LIMIT, ARENA_LIMIT);
    const z = randomBetween(-ARENA_LIMIT, ARENA_LIMIT);
    const blocked = queryWallsNear({ x, z }, PICKUP_CLEARANCE).some((wall) => (
      Math.abs(x - wall.x) <= wall.hw + PICKUP_CLEARANCE
      && Math.abs(z - wall.z) <= wall.hd + PICKUP_CLEARANCE
    ));
    if (!blocked) return { x, z };
  }
  return { x: 0, z: 0 };
}

function beginSpawn(powerup, powerups, now, occupiedPositions) {
  const position = randomSpawnPosition(powerup, powerups, occupiedPositions);
  powerup.group.position.set(position.x, HIDDEN_Y, position.z);
  powerup.group.rotation.y = Math.random() * Math.PI * 2;
  powerup.group.visible = true;
  powerup.active = false;
  powerup.state = "spawning";
  powerup.spawnStartedAt = now;
  powerup.spawnDuration = randomBetween(2.5, 3.4);
  setFade(powerup, 0);
}

export function updatePowerupVisuals(powerups, dt, now, occupiedPositions = []) {
  for (const powerup of powerups) {
    if (powerup.state === "waiting" && now >= powerup.respawnAt) {
      beginSpawn(powerup, powerups, now, occupiedPositions);
    }
    if (powerup.state === "spawning") {
      const progress = Math.min(1, (now - powerup.spawnStartedAt) / powerup.spawnDuration);
      const rise = 1 - (1 - progress) ** 3;
      const fade = progress * progress * (3 - 2 * progress);
      powerup.group.position.y = THREE.MathUtils.lerp(HIDDEN_Y, RESTING_Y, rise);
      powerup.group.rotation.y += dt * 0.48;
      setFade(powerup, fade);
      if (progress >= 1) {
        powerup.state = "active";
        powerup.active = true;
        setFade(powerup, 1);
      }
      continue;
    }
    if (!powerup.active) continue;
    powerup.group.rotation.y += dt * 0.48;
    powerup.group.position.y = RESTING_Y
      + Math.sin(now * 2.2 + powerup.phase) * 0.32;
  }
}

export function syncNetworkPowerups(powerups, states, dt, now) {
  const byId = new Map((states ?? []).map((state) => [state.id, state]));
  for (const powerup of powerups) {
    const state = byId.get(powerup.id);
    const active = Boolean(state?.active);
    if (!active) {
      powerup.active = false;
      powerup.state = "waiting";
      powerup.group.visible = false;
      setFade(powerup, 0);
      continue;
    }
    if (powerup.state === "waiting") {
      powerup.state = "spawning";
      powerup.spawnStartedAt = now;
      powerup.spawnDuration = 2.8;
      powerup.group.position.set(state.x, HIDDEN_Y, state.z);
      powerup.group.visible = true;
      setFade(powerup, 0);
    }
    if (powerup.state === "spawning") {
      const progress = Math.min(1, (now - powerup.spawnStartedAt) / powerup.spawnDuration);
      const rise = 1 - (1 - progress) ** 3;
      const fade = progress * progress * (3 - 2 * progress);
      powerup.group.position.set(
        state.x,
        THREE.MathUtils.lerp(HIDDEN_Y, RESTING_Y, rise),
        state.z,
      );
      powerup.group.rotation.y += dt * 0.48;
      setFade(powerup, fade);
      if (progress >= 1) {
        powerup.state = "active";
        powerup.active = true;
        setFade(powerup, 1);
      }
      continue;
    }
    powerup.active = true;
    powerup.group.visible = true;
    powerup.group.position.set(
      state.x,
      RESTING_Y + Math.sin(now * 2.2 + powerup.phase) * 0.32,
      state.z,
    );
    powerup.group.rotation.y += dt * 0.48;
    setFade(powerup, 1);
  }
}

export function consumePowerup(powerup, now) {
  powerup.active = false;
  powerup.state = "waiting";
  powerup.group.visible = false;
  const respawnDelay = powerup.config.respawnDelay ?? [SPAWN_DELAY_MIN, SPAWN_DELAY_MAX];
  powerup.respawnAt = now + randomBetween(...respawnDelay);
  setFade(powerup, 0);
}

export function removePowerups(scene, powerups) {
  for (const powerup of powerups) {
    scene.remove(powerup.group);
    powerup.group.traverse((object) => {
      if (object.geometry?.userData?.disposable) object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material?.dispose?.();
    });
  }
}
