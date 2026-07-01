import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVE_MATCH_TANK_IDS,
  TANK_PROFILES,
  getTankProfile,
} from "../tank-roster.js";
import { ARENA_EXPANSION, ARENA_SCALE, ARENA_SIZE } from "../arena-config.js";

test("four multiplayer tank profiles have unique colours and spawn sectors", () => {
  const profiles = Object.values(TANK_PROFILES);
  assert.equal(profiles.length, 4);
  assert.equal(new Set(profiles.map((profile) => profile.accent)).size, 4);
  assert.equal(new Set(profiles.map((profile) => `${profile.spawn.x}:${profile.spawn.z}`)).size, 4);
});

test("only blue and red are active in the current two-player match", () => {
  assert.deepEqual(ACTIVE_MATCH_TANK_IDS, ["blue", "red"]);
  assert.equal(getTankProfile("blue").enabled, true);
  assert.equal(getTankProfile("red").enabled, true);
  assert.equal(getTankProfile("yellow").enabled, false);
  assert.equal(getTankProfile("green").enabled, false);
});

test("all four spawn sectors fit inside the five-times-expanded arena", () => {
  assert.equal(ARENA_SCALE, 6);
  assert.equal(ARENA_EXPANSION, 5);
  assert.equal(ARENA_SIZE, 720);
  for (const profile of Object.values(TANK_PROFILES)) {
    assert.ok(Math.abs(profile.spawn.x) < ARENA_SIZE / 2);
    assert.ok(Math.abs(profile.spawn.z) < ARENA_SIZE / 2);
  }
});
