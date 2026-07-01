import test from "node:test";
import assert from "node:assert/strict";
import { expandPowerupPool } from "../powerup-config.js";

test("local arena uses fourteen distributed power-up instances", () => {
  const pool = expandPowerupPool("local");
  assert.equal(pool.length, 14);
  assert.equal(new Set(pool.map((item) => item.id)).size, 14);
  assert.equal(pool.filter((item) => item.type === "satellite").length, 1);
});

test("network arena uses eighteen power-ups but only one rare satellite", () => {
  const pool = expandPowerupPool("network");
  assert.equal(pool.length, 18);
  assert.equal(pool.filter((item) => item.type === "satellite").length, 1);
  assert.ok(pool.filter((item) => item.type === "ammo").length > 1);
});
