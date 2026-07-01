import * as THREE from "three";
import {
  ARENA_SIZE,
  ARENA_SCALE,
  BASE_ARENA_SIZE,
  ARENA_EXPANSION,
  ARENA_SECTOR_SIZE,
} from "./arena-config.js?v=20260629-arena5x1";
import { PORTALS } from "./portals.js?v=20260629-portals1";
import { createArenaWalls } from "./arena-layout.js?v=20260630-network1";

export {
  ARENA_SIZE,
  ARENA_SCALE,
  BASE_ARENA_SIZE,
  ARENA_EXPANSION,
  ARENA_SECTOR_SIZE,
};
export const WALL_HEIGHT = 6.5;
export const CYAN = 0x15e7ff;
export const MAGENTA = 0xff2bd6;

export const WALLS = createArenaWalls();
const WALL_GRID_SIZE = 36;
const wallGrid = new Map();

function wallGridKey(x, z) {
  return `${x}:${z}`;
}

function gridCoordinate(value) {
  return Math.floor(value / WALL_GRID_SIZE);
}

for (const item of WALLS) {
  const minX = gridCoordinate(item.x - item.hw);
  const maxX = gridCoordinate(item.x + item.hw);
  const minZ = gridCoordinate(item.z - item.hd);
  const maxZ = gridCoordinate(item.z + item.hd);
  for (let z = minZ; z <= maxZ; z += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const key = wallGridKey(x, z);
      if (!wallGrid.has(key)) wallGrid.set(key, []);
      wallGrid.get(key).push(item);
    }
  }
}

export function queryWallsInBounds(minX, minZ, maxX, maxZ) {
  const result = new Set();
  for (let z = gridCoordinate(minZ); z <= gridCoordinate(maxZ); z += 1) {
    for (let x = gridCoordinate(minX); x <= gridCoordinate(maxX); x += 1) {
      for (const item of wallGrid.get(wallGridKey(x, z)) ?? []) {
        if (!item.destroyed) result.add(item);
      }
    }
  }
  return [...result];
}

export function queryWallsNear(point, padding = 0) {
  return queryWallsInBounds(
    point.x - padding,
    point.z - padding,
    point.x + padding,
    point.z + padding,
  );
}

export function queryWallsForSegment(a, b, padding = 0) {
  return queryWallsInBounds(
    Math.min(a.x, b.x) - padding,
    Math.min(a.z, b.z) - padding,
    Math.max(a.x, b.x) + padding,
    Math.max(a.z, b.z) + padding,
  );
}

function setWallDestroyed(wall, destroyed) {
  wall.destroyed = destroyed;
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  hiddenMatrix.setPosition(wall.x, 0, wall.z);
  for (const binding of wall.visualBindings) {
    binding.mesh.setMatrixAt(
      binding.index,
      destroyed ? hiddenMatrix : binding.matrix,
    );
    binding.mesh.instanceMatrix.needsUpdate = true;
  }
  for (const binding of wall.edgeBindings) {
    const { attribute, start, count, original } = binding;
    for (let offset = 0; offset < count; offset += 1) {
      const source = offset * 3;
      attribute.setXYZ(
        start + offset,
        destroyed ? wall.x : original[source],
        destroyed ? 0 : original[source + 1],
        destroyed ? wall.z : original[source + 2],
      );
    }
    attribute.needsUpdate = true;
  }
}

export function destroyWall(wall) {
  if (!wall?.destructible || wall.destroyed) return false;
  setWallDestroyed(wall, true);
  return true;
}

export function restoreWalls() {
  for (const item of WALLS) {
    if (item.destroyed) setWallDestroyed(item, false);
  }
}

function makeGridTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  context.fillStyle = "#020407";
  context.fillRect(0, 0, 512, 512);
  context.strokeStyle = "#0a5260";
  context.lineWidth = 2.4;
  for (let i = 0; i <= 512; i += 32) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(512, i);
    context.stroke();
  }
  context.strokeStyle = "#18b7c9";
  context.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i, 512);
    context.stroke();
    context.beginPath();
    context.moveTo(0, i);
    context.lineTo(512, i);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  const repeats = ARENA_SIZE / BASE_ARENA_SIZE;
  texture.repeat.set(repeats, repeats);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addInstancedBoxes(group, specifications, material, name) {
  if (!specifications.length) return;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material,
    specifications.length,
  );
  mesh.name = name;
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < specifications.length; index += 1) {
    const item = specifications[index];
    matrix.makeScale(item.width, item.height, item.depth);
    matrix.setPosition(item.x, item.y, item.z);
    mesh.setMatrixAt(index, matrix);
    if (item.wall) {
      item.wall.visualBindings.push({
        mesh,
        index,
        matrix: matrix.clone(),
      });
    }
  }
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
}

function addEdgeLines(group, walls, color) {
  const corners = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
  ];
  const pairs = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const positions = [];
  const bindings = [];
  for (const item of walls) {
    const start = positions.length / 3;
    for (const [from, to] of pairs) {
      for (const cornerIndex of [from, to]) {
        const corner = corners[cornerIndex];
        positions.push(
          item.x + corner[0] * item.hw,
          WALL_HEIGHT / 2 + corner[1] * WALL_HEIGHT / 2,
          item.z + corner[2] * item.hd,
        );
      }
    }
    const count = positions.length / 3 - start;
    bindings.push({
      wall: item,
      start,
      count,
      original: positions.slice(start * 3),
    });
  }
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.Float32BufferAttribute(positions, 3);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", attribute);
  for (const binding of bindings) {
    binding.wall.edgeBindings.push({
      attribute,
      start: binding.start,
      count: binding.count,
      original: binding.original,
    });
  }
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  lines.name = "BatchedWallEdges";
  group.add(lines);
}

function addPortalVisuals(group, makeGlowMaterial) {
  for (const portal of PORTALS) {
    const root = new THREE.Group();
    root.name = `Portal_${portal.id}`;
    root.position.set(portal.x, 6.4, portal.z);
    if (portal.id === "east" || portal.id === "west") root.rotation.y = Math.PI / 2;

    const surface = new THREE.Mesh(
      new THREE.CircleGeometry(6.1, 48),
      new THREE.MeshBasicMaterial({
        color: portal.color,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    surface.name = "PortalSurface";
    root.add(surface);
    const motes = new THREE.Points(
      new THREE.BufferGeometry().setFromPoints(Array.from({ length: 70 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * 5.7;
        return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.08);
      })),
      new THREE.PointsMaterial({
        color: portal.color,
        size: 0.22,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    motes.name = "PortalMotes";
    root.add(motes);
    for (const [radius, tube, opacity] of [[6.5, 0.34, 1], [5.7, 0.09, 0.68]]) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 10, 72),
        makeGlowMaterial(portal.color, opacity),
      );
      root.add(ring);
    }
    const light = new THREE.PointLight(portal.color, 38, 34, 2);
    light.position.z = portal.id === "north" || portal.id === "west" ? 2 : -2;
    root.add(light);
    group.add(root);
  }
}

export function buildArena() {
  const group = new THREE.Group();
  for (const item of WALLS) {
    item.destroyed = false;
    item.visualBindings.length = 0;
    item.edgeBindings.length = 0;
  }
  const gridTexture = makeGridTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE),
    new THREE.MeshPhysicalMaterial({
      color: 0x03070b,
      map: gridTexture,
      metalness: 0.82,
      roughness: 0.16,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      emissive: 0x087080,
      emissiveMap: gridTexture,
      emissiveIntensity: 0.72,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  const makeWallMaterial = (accent) => new THREE.MeshPhysicalMaterial({
    color: 0x07131c,
    metalness: 0.82,
    roughness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(accent).multiplyScalar(0.045),
    emissiveIntensity: 1.25,
  });
  const makeCoreMaterial = (color) => new THREE.MeshBasicMaterial({
    color,
    toneMapped: false,
  });
  const makeGlowMaterial = (color, opacity = 0.18) => new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  for (const [accent, selectedWalls] of [
    [CYAN, WALLS.filter((_, index) => index % 3 !== 0)],
    [MAGENTA, WALLS.filter((_, index) => index % 3 === 0)],
  ]) {
    addInstancedBoxes(
      group,
      selectedWalls.map((item) => ({
        wall: item,
        x: item.x,
        y: WALL_HEIGHT / 2,
        z: item.z,
        width: item.hw * 2,
        height: WALL_HEIGHT,
        depth: item.hd * 2,
      })),
      makeWallMaterial(accent),
      "BatchedWallBodies",
    );
    addEdgeLines(group, selectedWalls, accent);

    const coreBoxes = [];
    const glowBoxes = [];
    for (const item of selectedWalls) {
      for (const y of [0.1, WALL_HEIGHT * 0.52, WALL_HEIGHT - 0.1]) {
        const middle = y === WALL_HEIGHT * 0.52;
        coreBoxes.push({
          wall: item,
          x: item.x,
          y,
          z: item.z,
          width: item.hw * 2 + 0.12,
          height: middle ? 0.07 : 0.13,
          depth: item.hd * 2 + 0.12,
        });
        glowBoxes.push({
          wall: item,
          x: item.x,
          y,
          z: item.z,
          width: item.hw * 2 + 0.32,
          height: middle ? 0.42 : 0.36,
          depth: item.hd * 2 + 0.32,
        });
      }
      glowBoxes.push({
        wall: item,
        x: item.x,
        y: WALL_HEIGHT + 0.035,
        z: item.z,
        width: item.hw * 2,
        height: 0.045,
        depth: item.hd * 2,
      });
    }
    addInstancedBoxes(group, coreBoxes, makeCoreMaterial(accent), "BatchedWallCores");
    addInstancedBoxes(group, glowBoxes, makeGlowMaterial(accent, 0.14), "BatchedWallGlow");
  }
  addPortalVisuals(group, makeGlowMaterial);

  const centerRing = new THREE.Mesh(
    new THREE.RingGeometry(7.8, 8.35, 64),
    new THREE.MeshBasicMaterial({ color: MAGENTA, side: THREE.DoubleSide, toneMapped: false }),
  );
  centerRing.rotation.x = -Math.PI / 2;
  centerRing.position.y = 0.04;
  group.add(centerRing);

  const centerGlow = new THREE.Mesh(
    new THREE.RingGeometry(7.2, 8.9, 64),
    makeGlowMaterial(MAGENTA, 0.14),
  );
  centerGlow.rotation.x = -Math.PI / 2;
  centerGlow.position.y = 0.035;
  group.add(centerGlow);

  return group;
}
