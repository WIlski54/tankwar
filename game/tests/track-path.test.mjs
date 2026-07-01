import test from "node:test";
import assert from "node:assert/strict";
import { createPolylineTrackPath, createRoundedTrackPath } from "../track-path.js";

test("track path wraps around the full wheel envelope", () => {
  const path = createRoundedTrackPath();
  const samples = Array.from({ length: 200 }, (_, index) => (
    path.pointAt(path.perimeter * index / 200)
  ));
  const xs = samples.map((point) => point.x);
  const ys = samples.map((point) => point.y);
  assert.ok(Math.min(...xs) < -0.89);
  assert.ok(Math.max(...xs) > 0.89);
  assert.ok(Math.min(...ys) < -0.41);
  assert.ok(Math.max(...ys) > 0.01);
});

test("track path is continuous at its seam", () => {
  const path = createRoundedTrackPath();
  const before = path.pointAt(path.perimeter - 1e-5);
  const after = path.pointAt(1e-5);
  assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1e-3);
});

test("measured polyline path preserves its supplied contour", () => {
  const path = createPolylineTrackPath([
    { x: -2, y: 1 }, { x: 2, y: 1 }, { x: 2, y: -1 }, { x: -2, y: -1 },
  ]);
  assert.ok(Math.abs(path.perimeter - 12) < 1e-9);
  const topMiddle = path.pointAt(2);
  assert.ok(Math.abs(topMiddle.x) < 1e-9);
  assert.equal(topMiddle.y, 1);
  const seam = path.pointAt(path.perimeter);
  assert.deepEqual({ x: seam.x, y: seam.y }, { x: -2, y: 1 });
});
