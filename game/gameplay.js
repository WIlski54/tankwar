export const STARTING_LIVES = 3;
export const MAX_ARMOR = 100;
export const HIT_DAMAGE = 20;
export const STARTING_AMMO = 10;
export const SHIELD_DURATION = 20;
export const SHIELD_HITS = 5;
export const SATELLITE_DURATION = 12;

export function initializeCombatant(target) {
  target.lives = STARTING_LIVES;
  target.maxLives = STARTING_LIVES;
  target.armor = MAX_ARMOR;
  target.ammo = STARTING_AMMO;
  target.lethalShots = 0;
  target.wallBreakerShots = 0;
  target.mines = 0;
  target.satelliteCharges = 0;
  target.satelliteUntil = 0;
  target.shieldType = null;
  target.shieldUntil = 0;
  target.shieldHits = 0;
  return target;
}

export function applyHit(target, damage = HIT_DAMAGE) {
  target.armor = Math.max(0, target.armor - damage);
  if (target.armor > 0) return { destroyed: false, eliminated: false };
  target.lives = Math.max(0, target.lives - 1);
  return { destroyed: true, eliminated: target.lives === 0 };
}

export function restoreForRespawn(target) {
  target.armor = MAX_ARMOR;
  target.shieldType = null;
  target.shieldUntil = 0;
  target.shieldHits = 0;
}

export function healArmor(target, amount = 50) {
  const before = target.armor;
  target.armor = Math.min(MAX_ARMOR, target.armor + amount);
  return target.armor - before;
}

export function grantLife(target, amount = 1) {
  target.lives += amount;
  target.maxLives = Math.max(target.maxLives ?? STARTING_LIVES, target.lives);
}

export function grantAmmo(target, amount = 5) {
  target.ammo += amount;
}

export function grantLethalShot(target) {
  if (target.lethalShots > 0) return false;
  target.lethalShots = 1;
  return true;
}

export function grantWallBreakerShots(target, amount = 3) {
  target.wallBreakerShots += amount;
}

export function grantMines(target, amount = 3) {
  target.mines += amount;
}

export function grantSatelliteCharge(target) {
  if (target.satelliteCharges > 0 || target.satelliteUntil > 0) return false;
  target.satelliteCharges = 1;
  return true;
}

export function activateSatelliteView(target, now) {
  if (target.satelliteCharges <= 0 || now < target.satelliteUntil) return false;
  target.satelliteCharges -= 1;
  target.satelliteUntil = now + SATELLITE_DURATION;
  return true;
}

export function expireSatelliteView(target, now) {
  if (target.satelliteUntil > 0 && now >= target.satelliteUntil) {
    target.satelliteUntil = 0;
    return true;
  }
  return false;
}

export function activateShield(target, type, now) {
  target.shieldType = type;
  target.shieldUntil = now + SHIELD_DURATION;
  target.shieldHits = SHIELD_HITS;
}

export function expireShield(target, now) {
  if (target.shieldType && now >= target.shieldUntil) {
    target.shieldType = null;
    target.shieldHits = 0;
  }
}

export function absorbShieldHit(target) {
  if (!target.shieldType || target.shieldHits <= 0) return false;
  target.shieldHits -= 1;
  if (target.shieldHits === 0) {
    target.shieldType = null;
    target.shieldUntil = 0;
  }
  return true;
}
