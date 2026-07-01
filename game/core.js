export const TAU = Math.PI * 2;

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function wrapAngle(angle) {
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle;
}

export function approachAngle(current, target, maxStep) {
  const diff = wrapAngle(target - current);
  return Math.abs(diff) <= maxStep ? target : current + Math.sign(diff) * maxStep;
}

export class DriveModel {
  constructor({ maxSpeed = 17, reverseSpeed = 9, accel = 23, drag = 30, turnRate = 1.85 } = {}) {
    Object.assign(this, { maxSpeed, reverseSpeed, accel, drag, turnRate });
    this.speed = 0;
    this.heading = 0;
    this.vLeft = 0;
    this.vRight = 0;
  }

  update(dt, throttle, steer) {
    const target = throttle >= 0 ? throttle * this.maxSpeed : throttle * this.reverseSpeed;
    const rate = Math.abs(target) > Math.abs(this.speed) ? this.accel : this.drag;
    this.speed += clamp(target - this.speed, -rate * dt, rate * dt);
    const motionFactor = 0.38 + 0.62 * Math.min(1, Math.abs(this.speed) / this.maxSpeed);
    const yawRate = steer * this.turnRate * motionFactor;
    this.heading = wrapAngle(this.heading + yawRate * dt);
    this.vLeft = this.speed - yawRate * 1.8;
    this.vRight = this.speed + yawRate * 1.8;
    return {
      dx: Math.sin(this.heading) * this.speed * dt,
      dz: Math.cos(this.heading) * this.speed * dt,
      heading: this.heading,
      vLeft: this.vLeft,
      vRight: this.vRight,
    };
  }

  reset(heading = 0) {
    this.speed = 0;
    this.heading = heading;
    this.vLeft = 0;
    this.vRight = 0;
  }
}

export class Weapon {
  constructor(cooldown = 0.72) {
    this.cooldown = cooldown;
    this.lastShot = -999;
  }

  ready(now) {
    return now - this.lastShot >= this.cooldown;
  }

  tryFire(now) {
    if (!this.ready(now)) return false;
    this.lastShot = now;
    return true;
  }
}

export function resolveWalls(position, radius, walls) {
  let x = position.x;
  let z = position.z;
  for (let pass = 0; pass < 2; pass += 1) {
    for (const wall of walls) {
      if (wall.destroyed) continue;
      const nearX = clamp(x, wall.x - wall.hw, wall.x + wall.hw);
      const nearZ = clamp(z, wall.z - wall.hd, wall.z + wall.hd);
      const dx = x - nearX;
      const dz = z - nearZ;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared >= radius * radius) continue;
      if (distanceSquared > 1e-9) {
        const distance = Math.sqrt(distanceSquared);
        const push = (radius - distance) / distance;
        x += dx * push;
        z += dz * push;
      } else {
        const overlapX = wall.hw + radius - Math.abs(x - wall.x);
        const overlapZ = wall.hd + radius - Math.abs(z - wall.z);
        if (overlapX < overlapZ) x += x >= wall.x ? overlapX : -overlapX;
        else z += z >= wall.z ? overlapZ : -overlapZ;
      }
    }
  }
  return { x, z };
}

export function pointInWall(point, wall, padding = 0) {
  return !wall.destroyed
    && Math.abs(point.x - wall.x) <= wall.hw + padding
    && Math.abs(point.z - wall.z) <= wall.hd + padding;
}

export function anyWallHit(point, walls, padding = 0) {
  return walls.some((wall) => pointInWall(point, wall, padding));
}

export function findWallHit(point, walls, padding = 0) {
  return walls.find((wall) => pointInWall(point, wall, padding)) ?? null;
}

export function segmentHitsWall(a, b, walls, padding = 0) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const wall of walls) {
    if (wall.destroyed) continue;
    const minX = wall.x - wall.hw - padding;
    const maxX = wall.x + wall.hw + padding;
    const minZ = wall.z - wall.hd - padding;
    const maxZ = wall.z + wall.hd + padding;
    let near = 0;
    let far = 1;
    for (const [origin, delta, min, max] of [
      [a.x, dx, minX, maxX],
      [a.z, dz, minZ, maxZ],
    ]) {
      if (Math.abs(delta) < 1e-9) {
        if (origin < min || origin > max) {
          near = 1;
          far = 0;
          break;
        }
        continue;
      }
      let first = (min - origin) / delta;
      let second = (max - origin) / delta;
      if (first > second) [first, second] = [second, first];
      near = Math.max(near, first);
      far = Math.min(far, second);
      if (near > far) break;
    }
    if (near <= far) return true;
  }
  return false;
}

export function circlesOverlap(a, ar, b, br) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  const radius = ar + br;
  return dx * dx + dz * dz <= radius * radius;
}

export function aimDirection(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * cosPitch,
  };
}
