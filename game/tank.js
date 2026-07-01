import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  createPolylineTrackPath,
  createRoundedTrackPath,
} from "./track-path.js?v=20260628-audio2";

const loader = new GLTFLoader();
let templatePromise;
const MODEL_SCALE = 6;
const MODEL_GROUND_OFFSET = 2.54; // source bbox minY = -0.422; place tracks on y=0
const TRACK_PROFILE_QUANTILE = 0.9;
const TRACK_SURFACE_LIFT = 0.022; // half a link: keep moving tread above the source shell
const TRACK_WIDTH_SCALE = 1.35;
// Source-space lift: the imported broad turret overlaps the hull by ~0.13 units.
// Raising the whole rotating assembly makes its sweep mechanically plausible.
const TURRET_CLEARANCE_LIFT = 0.14;

// Turret neon enhancement: a fresnel rim (so the flat side panels catch accent light
// and read as 3D) plus Tron-style neon edge lines like the arena walls. Tunable;
// verified in-browser.
const TURRET_RIM_STRENGTH = 0.12;  // restrained accent rim; edge lines carry the Tron glow
const TURRET_RIM_POWER = 2.6;      // higher = rim hugs the silhouette more tightly
const TURRET_EDGE_THRESHOLD = 34;  // degrees; only creases sharper than this glow
const TURRET_EDGE_OPACITY = 0.5;   // neon edge-line strength

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function collectRootLocalPositions(root, object) {
  if (!object) return [];
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const localMatrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const positions = [];
  object.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.geometry?.attributes?.position) return;
    localMatrix.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const attribute = mesh.geometry.attributes.position;
    for (let index = 0; index < attribute.count; index += 1) {
      point.fromBufferAttribute(attribute, index).applyMatrix4(localMatrix);
      positions.push({ x: point.x, y: point.y, z: point.z });
    }
  });
  return positions;
}

function measuredBeltPath(root, belt) {
  const positions = collectRootLocalPositions(root, belt);
  if (positions.length < 100) return createRoundedTrackPath();

  const xs = positions.map((point) => point.x);
  const ys = positions.map((point) => point.y);
  const centerX = quantile(xs, 0.5);
  const centerY = (Math.min(...ys) + Math.max(...ys)) * 0.5;
  const binCount = 96;
  const bins = Array.from({ length: binCount }, () => []);

  for (const point of positions) {
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const angle = Math.atan2(dy, dx);
    const index = Math.min(binCount - 1, Math.floor((angle + Math.PI) / (Math.PI * 2) * binCount));
    bins[index].push(Math.hypot(dx, dy));
  }

  // Follow the outside of the measured belt shell, not its median interior.
  const radii = bins.map((bin) => quantile(bin, TRACK_PROFILE_QUANTILE));
  for (let index = 0; index < radii.length; index += 1) {
    if (radii[index] > 0) continue;
    for (let offset = 1; offset < radii.length; offset += 1) {
      const before = radii[(index - offset + radii.length) % radii.length];
      const after = radii[(index + offset) % radii.length];
      if (before || after) {
        radii[index] = before || after;
        break;
      }
    }
  }

  let smooth = radii;
  for (let pass = 0; pass < 2; pass += 1) {
    smooth = smooth.map((radius, index) => (
      smooth[(index - 1 + smooth.length) % smooth.length] * 0.22
      + radius * 0.56
      + smooth[(index + 1) % smooth.length] * 0.22
    ));
  }
  const points = smooth.map((radius, index) => {
    const angle = -Math.PI + (index + 0.5) / binCount * Math.PI * 2;
    const liftedRadius = radius + TRACK_SURFACE_LIFT;
    return {
      x: centerX + Math.cos(angle) * liftedRadius,
      y: centerY + Math.sin(angle) * liftedRadius,
    };
  });
  return createPolylineTrackPath(points);
}

function measuredSideBand(root, wheelNodes, fallbackSide) {
  const positions = wheelNodes.flatMap((wheel) => collectRootLocalPositions(root, wheel));
  if (positions.length < 100) return { center: fallbackSide * 0.3, width: 0.19 };
  const values = positions.map((point) => point.z);
  const low = quantile(values, 0.04);
  const high = quantile(values, 0.96);
  return {
    center: (low + high) * 0.5,
    width: Math.max(0.14, Math.min(0.22, (high - low) * 0.94)),
  };
}

function createTurretUnderside(root, turret, pivotPosition, accent) {
  const positions = collectRootLocalPositions(root, turret);
  if (positions.length < 100) return null;
  const xs = positions.map((point) => point.x);
  const zs = positions.map((point) => point.z);
  const lowX = quantile(xs, 0.015);
  const highX = quantile(xs, 0.985);
  const lowZ = quantile(zs, 0.015);
  const highZ = quantile(zs, 0.985);
  const sizeX = (highX - lowX) * 0.98;
  const sizeZ = (highZ - lowZ) * 1.04;

  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 0.065, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0x04080c,
      metalness: 0.9,
      roughness: 0.24,
      clearcoat: 0.42,
      emissive: new THREE.Color(accent).multiplyScalar(0.022),
      emissiveIntensity: 0.72,
    }),
  );
  mesh.name = "TurretUnderside";
  mesh.scale.set(sizeX, 1, sizeZ);
  mesh.position.set(
    (lowX + highX) * 0.5 - pivotPosition.x,
    -0.014,
    (lowZ + highZ) * 0.5 - pivotPosition.z,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTurretRing(accent) {
  const group = new THREE.Group();
  group.name = "TurretRotationRing";

  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.225, 0.155, 64),
    new THREE.MeshPhysicalMaterial({
      color: 0x010407,
      metalness: 0.7,
      roughness: 0.34,
      clearcoat: 0.22,
    }),
  );
  collar.name = "TurretRingCollar";
  collar.position.y = -0.0525;
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  const neonRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.213, 0.003, 8, 64),
    new THREE.MeshBasicMaterial({
      color: accent,
      toneMapped: false,
    }),
  );
  neonRing.name = "TurretRingNeon";
  neonRing.rotation.x = Math.PI * 0.5;
  neonRing.position.y = 0.026;
  group.add(neonRing);
  return group;
}

function createHullTurretShoulders(accent) {
  const group = new THREE.Group();
  group.name = "FixedTurretShoulders";
  const shape = new THREE.Shape();
  shape.moveTo(-0.38, -0.035);
  shape.lineTo(0.31, -0.035);
  shape.lineTo(0.39, -0.005);
  shape.lineTo(0.34, 0.035);
  shape.lineTo(-0.32, 0.035);
  shape.lineTo(-0.4, 0.005);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.08,
    bevelEnabled: true,
    bevelSize: 0.006,
    bevelThickness: 0.006,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -0.04);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x02070b,
    metalness: 0.72,
    roughness: 0.32,
    clearcoat: 0.26,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    toneMapped: false,
  });

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(geometry, material);
    shoulder.name = side < 0 ? "FixedTurretShoulderLeft" : "FixedTurretShoulderRight";
    shoulder.position.set(0.25, 0.118, side * 0.285);
    shoulder.castShadow = true;
    shoulder.receiveShadow = true;
    group.add(shoulder);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 0.006, 0.006),
      glowMaterial,
    );
    strip.name = `${shoulder.name}Neon`;
    strip.position.set(0.24, 0.156, side * 0.328);
    group.add(strip);
  }
  return group;
}

function createTrackLoop(accent, path, sideZ, trackWidth) {
  const linkCount = Math.max(52, Math.min(72, Math.round(path.perimeter / 0.072)));
  const linkLength = path.perimeter / linkCount * 0.74;
  const geometry = new THREE.BoxGeometry(linkLength, 0.042, trackWidth * TRACK_WIDTH_SCALE);
  const material = new THREE.MeshPhysicalMaterial({
    color: 0x1b242b,
    metalness: 0.9,
    roughness: 0.36,
    clearcoat: 0.32,
    emissive: new THREE.Color(accent).multiplyScalar(0.018),
    emissiveIntensity: 0.72,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, linkCount);
  mesh.name = sideZ > 0 ? "TrackLoopLeft" : "TrackLoopRight";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1);
  let phase = 0;

  function update() {
    for (let index = 0; index < linkCount; index += 1) {
      const point = path.pointAt(phase + path.perimeter * index / linkCount);
      position.set(point.x, point.y, sideZ);
      rotation.setFromAxisAngle(zAxis, point.angle);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  update();
  return {
    mesh,
    advance(distance) {
      if (Math.abs(distance) < 0.00001) return;
      phase += distance;
      update();
    },
  };
}

function boostMaterials(root, accent) {
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const sourceMaterial = object.material;
    object.material = sourceMaterial.clone();
    if (object.name.startsWith("TurretSkirt")) {
      object.material = new THREE.MeshStandardMaterial({
        color: 0x010305,
        metalness: 0.28,
        roughness: 0.58,
      });
    } else if (object.name.startsWith("Turret") || object.name.startsWith("Barrel")) {
      object.material = new THREE.MeshStandardMaterial({
        color: 0x010408,
        metalness: 0.22,
        roughness: 0.64,
      });
    } else {
      object.material.metalness = Math.max(0.72, object.material.metalness ?? 0);
      object.material.roughness = Math.min(0.28, object.material.roughness ?? 1);
      object.material.emissive = new THREE.Color(accent).multiplyScalar(0.18);
      object.material.emissiveIntensity = 1.4;
    }
    object.material.needsUpdate = true;
  });
}

// Adds a fresnel rim emissive in the accent colour so flat panels glow toward their
// grazing edges -- gives the otherwise plain turret sides a plastic, lit-edge look.
function addRimGlow(object, accent, strength, power) {
  const color = new THREE.Color(accent);
  object.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.material || mesh.name.startsWith("TurretSkirt")) return;
    const material = mesh.material;
    material.side = THREE.DoubleSide; // the split turret is an open shell; render it solid
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = { value: color };
      shader.uniforms.uRimStrength = { value: strength };
      shader.uniforms.uRimPower = { value: power };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;",
        )
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\n  float rimFacing = abs(dot(normalize(vViewPosition), normal));\n  totalEmissiveRadiance += uRimColor * pow(1.0 - rimFacing, uRimPower) * uRimStrength;",
        );
    };
    material.needsUpdate = true;
  });
}

// Tron-style neon edge lines on MANIFOLD creases only (edges shared by two faces
// whose dihedral angle exceeds the threshold). Skipping open boundary edges is what
// stops the neon from tracing the ragged split seam (the "stamped-out" look).
function addTurretNeonEdges(object, accent, thresholdDeg, opacity) {
  const color = new THREE.Color(accent);
  const cosThreshold = Math.cos((thresholdDeg * Math.PI) / 180);
  const meshes = [];
  object.traverse((mesh) => {
    if (
      mesh.isMesh
      && mesh.geometry?.attributes?.position
      && !mesh.name.startsWith("TurretSkirt")
    ) {
      meshes.push(mesh);
    }
  });
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    const position = geometry.attributes.position;
    const index = geometry.index ? geometry.index.array : null;
    const triCount = index ? index.length / 3 : position.count / 3;
    const vid = (t, k) => (index ? index[t * 3 + k] : t * 3 + k);
    const edges = new Map();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const normal = new THREE.Vector3();
    for (let t = 0; t < triCount; t += 1) {
      const i0 = vid(t, 0);
      const i1 = vid(t, 1);
      const i2 = vid(t, 2);
      a.fromBufferAttribute(position, i0);
      b.fromBufferAttribute(position, i1);
      c.fromBufferAttribute(position, i2);
      normal.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a)).normalize();
      const pairs = [[i0, i1], [i1, i2], [i2, i0]];
      for (const [p, q] of pairs) {
        const u = Math.min(p, q);
        const v = Math.max(p, q);
        const key = u * 1e7 + v;
        const existing = edges.get(key);
        if (!existing) {
          edges.set(key, { u, v, nx: normal.x, ny: normal.y, nz: normal.z, count: 1, crease: false });
        } else {
          existing.count += 1;
          if (existing.count === 2) {
            const dot = existing.nx * normal.x + existing.ny * normal.y + existing.nz * normal.z;
            existing.crease = dot <= cosThreshold;
          }
        }
      }
    }
    const points = [];
    const va = new THREE.Vector3();
    const vb = new THREE.Vector3();
    for (const edge of edges.values()) {
      if (edge.count !== 2 || !edge.crease) continue;
      va.fromBufferAttribute(position, edge.u);
      vb.fromBufferAttribute(position, edge.v);
      points.push(va.x, va.y, va.z, vb.x, vb.y, vb.z);
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const line = new THREE.LineSegments(
      lineGeometry,
      new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    line.name = "TurretNeonEdges";
    line.renderOrder = 3;
    mesh.add(line);
  }
}

export async function loadTank(url, accent = 0x15e7ff) {
  templatePromise ||= loader.loadAsync(url);
  const gltf = await templatePromise;
  const root = gltf.scene.clone(true);
  root.rotation.y = Math.PI / 2;
  root.scale.setScalar(MODEL_SCALE);
  root.position.y = MODEL_GROUND_OFFSET;
  boostMaterials(root, accent);
  root.add(createHullTurretShoulders(accent));

  const beltLeft = root.getObjectByName("BeltLeft");
  const beltRight = root.getObjectByName("BeltRight");
  for (const belt of [beltLeft, beltRight]) {
    belt?.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: 0x080b10,
        metalness: 0.88,
        roughness: 0.34,
        clearcoat: 0.55,
        emissive: new THREE.Color(accent).multiplyScalar(0.025),
        emissiveIntensity: 0.7,
        side: THREE.DoubleSide,
      });
    });
  }

  // The visibly modelled tread/wheel groups are centered at |Z| ~= 0.292.
  // Place the procedural links directly over them instead of on the outer belt shell.
  const turret = root.getObjectByName("Turret");
  const barrel = root.getObjectByName("Barrel") || turret;
  const turretPivot = new THREE.Group();
  const barrelPivot = new THREE.Group();
  turretPivot.name = "TurretPivot";
  barrelPivot.name = "BarrelPitchPivot";
  if (turret) {
    const pivotPosition = turret.position.clone();
    const hasBlenderSkirt = Boolean(root.getObjectByName("TurretSkirt"));
    const turretUnderside = hasBlenderSkirt
      ? null
      : createTurretUnderside(root, turret, pivotPosition, accent);
    turretPivot.position.copy(pivotPosition);
    turretPivot.position.y += TURRET_CLEARANCE_LIFT;
    root.add(turretPivot);

    turret.position.sub(pivotPosition);
    turretPivot.add(turret);
    turretPivot.add(createTurretRing(accent));
    if (turretUnderside) turretPivot.add(turretUnderside);
    if (barrel && barrel !== turret) {
      barrelPivot.position.copy(barrel.position).sub(pivotPosition);
      turretPivot.add(barrelPivot);
      barrel.position.set(0, 0, 0);
      barrelPivot.add(barrel);
    }
    addRimGlow(turret, accent, TURRET_RIM_STRENGTH, TURRET_RIM_POWER);
    addTurretNeonEdges(turret, accent, TURRET_EDGE_THRESHOLD, TURRET_EDGE_OPACITY);
    if (barrel && barrel !== turret) {
      addRimGlow(barrel, accent, TURRET_RIM_STRENGTH * 0.65, TURRET_RIM_POWER);
    }
  }
  const wheelsLeft = [];
  const wheelsRight = [];
  root.traverse((object) => {
    if (object.name.startsWith("WheelL")) wheelsLeft.push(object);
    if (object.name.startsWith("WheelR")) wheelsRight.push(object);
  });

  const leftBand = measuredSideBand(root, wheelsLeft, 1);
  const rightBand = measuredSideBand(root, wheelsRight, -1);
  const leftPath = measuredBeltPath(root, beltLeft);
  const rightPath = measuredBeltPath(root, beltRight);
  const trackLeft = createTrackLoop(accent, leftPath, leftBand.center, leftBand.width);
  const trackRight = createTrackLoop(accent, rightPath, rightBand.center, rightBand.width);
  root.add(trackLeft.mesh, trackRight.mesh);
  root.traverse((object) => {
    if (!object.geometry) return;
    if (
      object.name === "TurretUnderside"
      || object.name === "TurretRingCollar"
      || object.name === "TurretRingNeon"
      || object.name === "TurretNeonEdges"
      || object.name.startsWith("FixedTurretShoulder")
      || object.name.startsWith("TrackLoop")
    ) {
      object.geometry.userData.runtimeOwned = true;
    }
  });

  return {
    root,
    turretPivot,
    barrelPivot,
    turret,
    barrel,
    wheelsLeft,
    wheelsRight,
    trackLeft,
    trackRight,
    turretYaw: 0,
  };
}

export function animateTank(rig, leftSpeed, rightSpeed, dt) {
  // The source wheel groups contain suspension fragments, so rotating them produces
  // orbiting shards. The visible motion comes from real links travelling around one
  // continuous loop per side; the wheel geometry remains stable underneath.
  rig.trackLeft.advance(-leftSpeed * dt / MODEL_SCALE);
  rig.trackRight.advance(-rightSpeed * dt / MODEL_SCALE);
}

export function setTurretYaw(rig, yaw) {
  rig.turretYaw = yaw;
  if (rig.turretPivot) rig.turretPivot.rotation.y = yaw;
}

export function setBarrelPitch(rig, pitch) {
  if (rig.barrelPivot) rig.barrelPivot.rotation.z = -pitch;
}
