import test from "node:test";
import assert from "node:assert/strict";
import {
  DriveModel,
  Weapon,
  aimDirection,
  approachAngle,
  circlesOverlap,
  findWallHit,
  resolveWalls,
  segmentHitsWall,
} from "../core.js";

test("drive model moves and differentially drives tracks", () => {
  const drive = new DriveModel({ accel: 100 });
  const state = drive.update(0.25, 1, 1);
  assert.ok(state.dz > 0);
  assert.notEqual(state.vLeft, state.vRight);
});

test("weapon enforces cooldown", () => {
  const weapon = new Weapon(1);
  assert.equal(weapon.tryFire(0), true);
  assert.equal(weapon.tryFire(0.5), false);
  assert.equal(weapon.tryFire(1.1), true);
});

test("angle approach uses shortest route", () => {
  const next = approachAngle(3, -3, 0.1);
  assert.ok(next > 3);
});

test("wall collision and line of sight", () => {
  const walls = [{ x: 0, z: 0, hw: 1, hd: 4 }];
  const resolved = resolveWalls({ x: -1.1, z: 0 }, 1, walls);
  assert.ok(resolved.x <= -2);
  assert.equal(segmentHitsWall({ x: -3, z: 0 }, { x: 3, z: 0 }, walls), true);
  assert.equal(segmentHitsWall({ x: -3, z: 8 }, { x: 3, z: 8 }, walls), false);
});

test("destroyed walls no longer block movement or projectiles", () => {
  const walls = [{ x: 0, z: 0, hw: 1, hd: 4, destroyed: true }];
  assert.equal(findWallHit({ x: 0, z: 0 }, walls), null);
  assert.deepEqual(resolveWalls({ x: 0, z: 0 }, 1, walls), { x: 0, z: 0 });
  assert.equal(segmentHitsWall({ x: -3, z: 0 }, { x: 3, z: 0 }, walls), false);
});

test("tank hit circles overlap", () => {
  assert.equal(circlesOverlap({ x: 0, z: 0 }, 2, { x: 3, z: 0 }, 2), true);
  assert.equal(circlesOverlap({ x: 0, z: 0 }, 2, { x: 5, z: 0 }, 2), false);
});

test("barrel pitch produces a normalized upward shot direction", () => {
  const direction = aimDirection(Math.PI / 2, 0.3);
  assert.ok(direction.y > 0);
  assert.ok(Math.abs(direction.z) < 1e-9);
  assert.ok(Math.abs(Math.hypot(direction.x, direction.y, direction.z) - 1) < 1e-9);
});
