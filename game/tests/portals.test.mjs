import test from "node:test";
import assert from "node:assert/strict";
import {
  PORTALS,
  choosePortalExit,
  findEnteredPortal,
} from "../portals.js";

test("the arena has one portal on every cardinal edge", () => {
  assert.deepEqual(PORTALS.map((portal) => portal.id), ["north", "east", "south", "west"]);
  assert.equal(new Set(PORTALS.map((portal) => `${portal.x}:${portal.z}`)).size, 4);
});

test("portal exits never return through the entry portal", () => {
  assert.equal(choosePortalExit("north", () => 0).id, "east");
  assert.equal(choosePortalExit("north", () => 0.999).id, "west");
  for (const entry of PORTALS) {
    assert.notEqual(choosePortalExit(entry.id, () => 0.5).id, entry.id);
  }
});

test("crossing an arena edge detects the matching portal", () => {
  assert.equal(findEnteredPortal({ x: 0, z: -362 }).id, "north");
  assert.equal(findEnteredPortal({ x: 362, z: 0 }).id, "east");
  assert.equal(findEnteredPortal({ x: 0, z: 362 }).id, "south");
  assert.equal(findEnteredPortal({ x: -362, z: 0 }).id, "west");
  assert.equal(findEnteredPortal({ x: 0, z: 0 }), null);
});
