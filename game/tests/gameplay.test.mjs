import test from "node:test";
import assert from "node:assert/strict";
import {
  absorbShieldHit,
  activateSatelliteView,
  activateShield,
  applyHit,
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
} from "../gameplay.js";

test("a combatant has three 100-percent lives and ten shells", () => {
  const tank = initializeCombatant({});
  assert.deepEqual(
    { lives: tank.lives, armor: tank.armor, ammo: tank.ammo },
    { lives: 3, armor: 100, ammo: 10 },
  );
});

test("five 20-percent hits consume one life", () => {
  const tank = initializeCombatant({});
  for (let hit = 0; hit < 4; hit += 1) assert.equal(applyHit(tank).destroyed, false);
  assert.deepEqual(applyHit(tank), { destroyed: true, eliminated: false });
  assert.equal(tank.lives, 2);
  restoreForRespawn(tank);
  assert.equal(tank.armor, 100);
});

test("health, life, and ammo pickups clamp or add correctly", () => {
  const tank = initializeCombatant({});
  tank.armor = 70;
  assert.equal(healArmor(tank), 30);
  grantLife(tank);
  grantAmmo(tank);
  assert.deepEqual(
    { lives: tank.lives, armor: tank.armor, ammo: tank.ammo },
    { lives: 4, armor: 100, ammo: 15 },
  );
});

test("the lethal pickup grants exactly one non-stacking shot", () => {
  const tank = initializeCombatant({});
  assert.equal(grantLethalShot(tank), true);
  assert.equal(grantLethalShot(tank), false);
  assert.equal(tank.lethalShots, 1);
});

test("hammer and mine pickups add three charges", () => {
  const tank = initializeCombatant({});
  assert.equal(tank.wallBreakerShots, 0);
  assert.equal(tank.mines, 0);
  grantWallBreakerShots(tank);
  grantMines(tank);
  assert.equal(tank.wallBreakerShots, 3);
  assert.equal(tank.mines, 3);
});

test("a mine hit removes sixty percent energy", () => {
  const tank = initializeCombatant({});
  const result = applyHit(tank, 60);
  assert.deepEqual(result, { destroyed: false, eliminated: false });
  assert.equal(tank.armor, 40);
});

test("a shield expires after five hits or twenty seconds", () => {
  const tank = initializeCombatant({});
  activateShield(tank, "normal", 10);
  for (let hit = 0; hit < 4; hit += 1) assert.equal(absorbShieldHit(tank), true);
  assert.equal(tank.shieldType, "normal");
  assert.equal(absorbShieldHit(tank), true);
  assert.equal(tank.shieldType, null);
  activateShield(tank, "reflect", 30);
  expireShield(tank, 50);
  assert.equal(tank.shieldType, null);
});

test("satellite pickup grants one non-stacking twelve-second uplink", () => {
  const tank = initializeCombatant({});
  assert.equal(grantSatelliteCharge(tank), true);
  assert.equal(grantSatelliteCharge(tank), false);
  assert.equal(activateSatelliteView(tank, 20), true);
  assert.equal(tank.satelliteCharges, 0);
  assert.equal(tank.satelliteUntil, 32);
});
