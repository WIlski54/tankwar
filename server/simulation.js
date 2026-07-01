import {
  DriveModel,
  Weapon,
  aimDirection,
  approachAngle,
  circlesOverlap,
  findWallHit,
  resolveWalls,
  segmentHitsWall,
  wrapAngle,
} from "../game/core.js";
import {
  absorbShieldHit,
  activateSatelliteView,
  activateShield,
  applyHit,
  expireSatelliteView,
  expireShield,
  grantAmmo,
  grantLethalShot,
  grantLife,
  grantMines,
  grantSatelliteCharge,
  grantWallBreakerShots,
  healArmor,
  initializeCombatant,
  restoreForRespawn,
} from "../game/gameplay.js";
import { createArenaWalls } from "../game/arena-layout.js";
import { ARENA_SECTOR_SIZE, ARENA_SIZE } from "../game/arena-config.js";
import { PORTALS, choosePortalExit, findEnteredPortal } from "../game/portals.js";
import { TANK_PROFILES } from "../game/tank-roster.js";
import { expandPowerupPool } from "../game/powerup-config.js";

const PROFILE_IDS = ["blue", "red", "yellow", "green"];
const TANK_RADIUS = 3.05;
const SHELL_SPEED = 58;
const MINE_LIFETIME = 75;
const MAX_MINES_PER_PLAYER = 6;
const POWERUP_RESPAWN = {
  lethal: [70, 110],
  satellite: [90, 140],
  default: [9, 20],
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

function cleanInput(input = {}) {
  return {
    throttle: clamp(Number(input.throttle) || 0, -1, 1),
    steer: clamp(Number(input.steer) || 0, -1, 1),
    turret: clamp(Number(input.turret) || 0, -1, 1),
    pitch: clamp(Number(input.pitch) || 0, -1, 1),
    aimYaw: Number.isFinite(input.aimYaw) ? wrapAngle(input.aimYaw) : null,
    aimPitch: Number.isFinite(input.aimPitch) ? clamp(input.aimPitch, -0.34, 0.32) : null,
    fire: Boolean(input.fire),
    mine: Boolean(input.mine),
    satellite: Boolean(input.satellite),
    sequence: Math.max(0, Number(input.sequence) || 0),
  };
}

function makePlayer(entry, slot) {
  const profileId = PROFILE_IDS[slot];
  const profile = TANK_PROFILES[profileId];
  const player = initializeCombatant({
    id: entry.id,
    name: entry.name,
    team: slot % 2 === 0 ? "alpha" : "omega",
    slot,
    profileId,
    isBot: Boolean(entry.isBot),
    connected: !entry.isBot,
    x: profile.spawn.x,
    z: profile.spawn.z,
    heading: profile.spawn.heading,
    turretYaw: 0,
    barrelPitch: 0,
    alive: true,
    invulnerable: 1.5,
    respawnAt: 0,
    portalReadyAt: 0,
    drive: new DriveModel(),
    weapon: new Weapon(),
    input: cleanInput(),
    lastMineSequence: 0,
    lastSatelliteSequence: 0,
    aiDecisionAt: 0,
    aiSteerBias: slot % 2 ? -1 : 1,
  });
  player.drive.reset(player.heading);
  return player;
}

export class AuthoritativeMatch {
  constructor(id, roster, callbacks = {}) {
    this.id = id;
    this.players = roster.map(makePlayer);
    this.walls = createArenaWalls();
    this.shells = [];
    this.mines = [];
    this.powerups = expandPowerupPool("network").map(({ id, type }) => ({
      id,
      type,
      active: false,
      x: 0,
      z: 0,
      respawnAt: type === "lethal"
        ? randomBetween(25, 45)
        : type === "satellite" ? randomBetween(35, 65) : randomBetween(0.25, 5),
    }));
    this.events = [];
    this.eventSequence = 0;
    this.shellSequence = 0;
    this.mineSequence = 0;
    this.elapsed = 0;
    this.ended = false;
    this.winner = null;
    this.onSnapshot = callbacks.onSnapshot ?? (() => {});
    this.onEnd = callbacks.onEnd ?? (() => {});
    this.lastSnapshotAt = 0;
    this.interval = null;
    this.lastTickAt = 0;
  }

  start() {
    this.lastTickAt = performance.now();
    this.interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickAt) / 1000));
      this.lastTickAt = now;
      this.tick(dt);
    }, 1000 / 30);
  }

  stop() {
    clearInterval(this.interval);
    this.interval = null;
  }

  setInput(playerId, input) {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player || player.isBot || this.ended) return;
    const next = cleanInput(input);
    if (next.sequence < player.input.sequence) return;
    player.input = next;
  }

  replaceWithBot(playerId) {
    const player = this.players.find((candidate) => candidate.id === playerId);
    if (!player) return;
    player.isBot = true;
    player.connected = false;
    player.name = `${player.name} // CORE AI`;
    this.emit("disconnect", { playerId, name: player.name });
  }

  tick(dt) {
    if (this.ended) return;
    this.elapsed += dt;
    this.updatePowerups();
    for (const player of this.players) this.updatePlayer(player, dt);
    this.resolveTankCollisions();
    this.updateShells(dt);
    this.updateMines();
    this.collectPowerups();
    this.checkWinner();

    if (this.elapsed - this.lastSnapshotAt >= 1 / 15) {
      this.lastSnapshotAt = this.elapsed;
      this.onSnapshot(this.snapshot());
    }
  }

  updatePlayer(player, dt) {
    if (!player.alive) {
      if (player.lives > 0 && player.respawnAt && this.elapsed >= player.respawnAt) {
        this.respawn(player);
      }
      return;
    }

    player.invulnerable = Math.max(0, player.invulnerable - dt);
    expireShield(player, this.elapsed);
    expireSatelliteView(player, this.elapsed);
    const input = player.isBot ? this.botInput(player) : player.input;
    const movement = player.drive.update(dt, input.throttle, input.steer);
    player.x += movement.dx;
    player.z += movement.dz;
    const resolved = resolveWalls({ x: player.x, z: player.z }, TANK_RADIUS, this.walls);
    player.x = resolved.x;
    player.z = resolved.z;
    player.heading = player.drive.heading;

    if (this.elapsed >= player.portalReadyAt) {
      const entry = findEnteredPortal(player, 0.3);
      if (entry) {
        const exit = choosePortalExit(entry.id);
        player.x = exit.exitX;
        player.z = exit.exitZ;
        player.heading = exit.heading;
        player.drive.reset(exit.heading);
        player.invulnerable = Math.max(player.invulnerable, 0.7);
        player.portalReadyAt = this.elapsed + 1.2;
        this.emit("portal", { playerId: player.id, entry: entry.id, exit: exit.id, x: player.x, z: player.z });
      }
    }

    if (input.aimYaw !== null) {
      const relativeTarget = wrapAngle(input.aimYaw - player.heading);
      player.turretYaw = approachAngle(player.turretYaw, relativeTarget, dt * 3.4);
    } else if (player.isBot && Number.isFinite(input.targetTurret)) {
      player.turretYaw = approachAngle(player.turretYaw, input.targetTurret, dt * 2.6);
    } else {
      player.turretYaw = wrapAngle(player.turretYaw + input.turret * dt * 1.85);
    }
    if (input.aimPitch !== null) {
      player.barrelPitch += clamp(input.aimPitch - player.barrelPitch, -dt * 0.72, dt * 0.72);
    } else {
      player.barrelPitch = clamp(player.barrelPitch + input.pitch * dt * 0.62, -0.34, 0.32);
    }

    if (input.mine && input.sequence > player.lastMineSequence) {
      player.lastMineSequence = input.sequence;
      this.deployMine(player);
    }
    if (input.satellite && input.sequence > player.lastSatelliteSequence) {
      player.lastSatelliteSequence = input.sequence;
      if (activateSatelliteView(player, this.elapsed)) {
        this.emit("satellite", { playerId: player.id, until: player.satelliteUntil });
      }
    }
    if (input.fire) this.fire(player);
  }

  botInput(player) {
    const enemies = this.players.filter((candidate) => (
      candidate.team !== player.team && candidate.alive
    ));
    if (!enemies.length) return cleanInput();
    const enemy = enemies.reduce((nearest, candidate) => (
      Math.hypot(candidate.x - player.x, candidate.z - player.z)
        < Math.hypot(nearest.x - player.x, nearest.z - player.z) ? candidate : nearest
    ));
    const dx = enemy.x - player.x;
    const dz = enemy.z - player.z;
    const distance = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let headingError = wrapAngle(targetHeading - player.heading);
    const ahead = {
      x: player.x + Math.sin(player.heading) * 10,
      z: player.z + Math.cos(player.heading) * 10,
    };
    const blocked = segmentHitsWall(player, ahead, this.walls, TANK_RADIUS);
    if (blocked && this.elapsed >= player.aiDecisionAt) {
      player.aiSteerBias *= -1;
      player.aiDecisionAt = this.elapsed + 0.65;
    }
    if (blocked) headingError = player.aiSteerBias * 1.4;
    const lineBlocked = segmentHitsWall(player, enemy, this.walls, 0.25);
    return {
      throttle: blocked ? -0.45 : distance > 25 || lineBlocked ? 1 : 0.22,
      steer: clamp(headingError * 1.8, -1, 1),
      turret: 0,
      pitch: 0,
      aimYaw: null,
      aimPitch: 0,
      targetTurret: wrapAngle(targetHeading - player.heading),
      fire: player.ammo > 0 && distance < 82 && (!lineBlocked || player.wallBreakerShots > 0),
      mine: false,
      satellite: false,
      sequence: 0,
    };
  }

  fire(player) {
    if (player.ammo <= 0 || !player.weapon.tryFire(this.elapsed)) return;
    const lethal = player.lethalShots > 0;
    const wallBreaker = !lethal && player.wallBreakerShots > 0;
    if (lethal) player.lethalShots -= 1;
    if (wallBreaker) player.wallBreakerShots -= 1;
    player.ammo -= 1;
    const direction = aimDirection(player.heading + player.turretYaw, player.barrelPitch);
    const shell = {
      id: `s${++this.shellSequence}`,
      ownerId: player.id,
      team: player.team,
      x: player.x + direction.x * 6.6,
      y: 3.1 + direction.y * 6.6,
      z: player.z + direction.z * 6.6,
      vx: direction.x * SHELL_SPEED,
      vy: direction.y * SHELL_SPEED,
      vz: direction.z * SHELL_SPEED,
      life: 2.1,
      lethal,
      wallBreaker,
      reflections: 0,
    };
    this.shells.push(shell);
    this.emit("shot", { playerId: player.id, shellId: shell.id, x: shell.x, y: shell.y, z: shell.z });
  }

  updateShells(dt) {
    for (let index = this.shells.length - 1; index >= 0; index -= 1) {
      const shell = this.shells[index];
      shell.life -= dt;
      shell.x += shell.vx * dt;
      shell.y += shell.vy * dt;
      shell.z += shell.vz * dt;
      const hitWall = shell.y <= 6.5 ? findWallHit(shell, this.walls, 0.2) : null;
      let destroyed = shell.life <= 0 || shell.y < 0 || shell.y > 38 || Boolean(hitWall);
      if (hitWall && shell.wallBreaker && hitWall.destructible && !hitWall.destroyed) {
        hitWall.destroyed = true;
        this.emit("wall", { wallIndex: this.walls.indexOf(hitWall), x: shell.x, y: shell.y, z: shell.z });
      }

      for (const target of this.players) {
        if (destroyed || !target.alive || target.invulnerable > 0) continue;
        if (target.id === shell.ownerId || target.team === shell.team) continue;
        if (Math.hypot(shell.x - target.x, shell.y - 2.6, shell.z - target.z) > 3.25) continue;
        destroyed = this.hitTank(target, shell);
      }
      if (!destroyed) {
        const powerup = this.powerups.find((candidate) => (
          candidate.active && Math.hypot(shell.x - candidate.x, shell.y - 2.45, shell.z - candidate.z) <= 2.4
        ));
        if (powerup) {
          powerup.active = false;
          const delay = POWERUP_RESPAWN[powerup.type] ?? POWERUP_RESPAWN.default;
          powerup.respawnAt = this.elapsed + randomBetween(...delay);
          this.emit("powerupDestroyed", {
            powerupId: powerup.id,
            powerupType: powerup.type,
            x: powerup.x,
            y: 2.45,
            z: powerup.z,
          });
          destroyed = true;
        }
      }

      if (destroyed) {
        this.emit("impact", { x: shell.x, y: shell.y, z: shell.z, lethal: shell.lethal, wallBreaker: shell.wallBreaker });
        this.shells.splice(index, 1);
      }
    }
  }

  hitTank(target, shell) {
    const attacker = this.players.find((player) => player.id === shell.ownerId);
    if (shell.lethal && target.shieldType) {
      target.shieldType = null;
      target.shieldHits = 0;
      target.shieldUntil = 0;
      this.damage(target, attacker, 50);
      return true;
    }
    if (target.shieldType === "reflect" && absorbShieldHit(target)) {
      shell.ownerId = target.id;
      shell.team = target.team;
      shell.vx *= -1;
      shell.vy *= -1;
      shell.vz *= -1;
      shell.reflections += 1;
      this.emit("reflect", { playerId: target.id, x: shell.x, y: shell.y, z: shell.z });
      return shell.reflections > 3;
    }
    if (target.shieldType && absorbShieldHit(target)) {
      this.emit("shield", { playerId: target.id, x: shell.x, y: shell.y, z: shell.z });
      return true;
    }
    this.damage(target, attacker, shell.lethal ? target.armor : 20);
    return true;
  }

  damage(target, attacker, amount) {
    const result = applyHit(target, amount);
    this.emit("hit", {
      targetId: target.id,
      attackerId: attacker?.id ?? null,
      amount,
      x: target.x,
      z: target.z,
      destroyed: result.destroyed,
    });
    if (!result.destroyed) return;
    target.alive = false;
    target.respawnAt = result.eliminated ? 0 : this.elapsed + 2.25;
  }

  respawn(player) {
    const spawn = TANK_PROFILES[player.profileId].spawn;
    restoreForRespawn(player);
    player.x = spawn.x;
    player.z = spawn.z;
    player.heading = spawn.heading;
    player.drive.reset(spawn.heading);
    player.turretYaw = 0;
    player.barrelPitch = 0;
    player.invulnerable = 1.75;
    player.alive = true;
    player.respawnAt = 0;
    player.portalReadyAt = 0;
    this.emit("respawn", { playerId: player.id, x: player.x, z: player.z });
  }

  deployMine(player) {
    if (player.mines <= 0) return;
    const active = this.mines.filter((mine) => mine.ownerId === player.id).length;
    if (active >= MAX_MINES_PER_PLAYER) return;
    player.mines -= 1;
    this.mines.push({
      id: `m${++this.mineSequence}`,
      ownerId: player.id,
      team: player.team,
      x: player.x,
      z: player.z,
      armedAt: this.elapsed + 1.1,
      expiresAt: this.elapsed + MINE_LIFETIME,
    });
    this.emit("mine", { playerId: player.id, x: player.x, z: player.z });
  }

  updateMines() {
    for (let index = this.mines.length - 1; index >= 0; index -= 1) {
      const mine = this.mines[index];
      if (this.elapsed >= mine.expiresAt) {
        this.mines.splice(index, 1);
        continue;
      }
      if (this.elapsed < mine.armedAt) continue;
      const target = this.players.find((player) => (
        player.alive
        && player.team !== mine.team
        && player.invulnerable <= 0
        && circlesOverlap(player, TANK_RADIUS, mine, 1.25)
      ));
      if (!target) continue;
      const owner = this.players.find((player) => player.id === mine.ownerId);
      this.mines.splice(index, 1);
      this.emit("mineExplosion", { x: mine.x, z: mine.z, targetId: target.id });
      this.damage(target, owner, 60);
    }
  }

  updatePowerups() {
    for (const powerup of this.powerups) {
      if (powerup.active || this.elapsed < powerup.respawnAt) continue;
      const position = this.randomOpenPosition();
      powerup.x = position.x;
      powerup.z = position.z;
      powerup.active = true;
      this.emit("powerupSpawn", { powerupId: powerup.id, powerupType: powerup.type, ...position });
    }
  }

  randomOpenPosition() {
    const limit = ARENA_SIZE / 2 - 8;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      const point = { x: randomBetween(-limit, limit), z: randomBetween(-limit, limit) };
      const blocked = this.walls.some((wall) => (
        !wall.destroyed
        && Math.abs(point.x - wall.x) <= wall.hw + 5.2
        && Math.abs(point.z - wall.z) <= wall.hd + 5.2
      ));
      if (blocked) continue;
      if (this.powerups.some((powerup) => (
        powerup.active && Math.hypot(point.x - powerup.x, point.z - powerup.z) < 13
      ))) continue;
      if (this.players.some((player) => (
        player.alive && Math.hypot(point.x - player.x, point.z - player.z) < 15
      ))) continue;
      const sectorX = Math.floor((point.x + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE);
      const sectorZ = Math.floor((point.z + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE);
      const sectorPopulation = this.powerups.filter((powerup) => (
        powerup.active
        && Math.floor((powerup.x + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE) === sectorX
        && Math.floor((powerup.z + ARENA_SIZE / 2) / ARENA_SECTOR_SIZE) === sectorZ
      )).length;
      if (sectorPopulation < 2) return point;
    }
    return { x: 0, z: 0 };
  }

  collectPowerups() {
    for (const powerup of this.powerups) {
      if (!powerup.active) continue;
      const player = this.players.find((candidate) => (
        candidate.alive && circlesOverlap(candidate, TANK_RADIUS, powerup, 2.4)
      ));
      if (!player || !this.applyPowerup(player, powerup.type)) continue;
      powerup.active = false;
      const delay = POWERUP_RESPAWN[powerup.type] ?? POWERUP_RESPAWN.default;
      powerup.respawnAt = this.elapsed + randomBetween(...delay);
      this.emit("pickup", { playerId: player.id, powerupType: powerup.type, x: powerup.x, z: powerup.z });
    }
  }

  applyPowerup(player, type) {
    switch (type) {
      case "health":
        if (player.armor >= 100) return false;
        healArmor(player);
        return true;
      case "life": grantLife(player); return true;
      case "ammo": grantAmmo(player); return true;
      case "shield": activateShield(player, "normal", this.elapsed); return true;
      case "reflect": activateShield(player, "reflect", this.elapsed); return true;
      case "lethal": return grantLethalShot(player);
      case "hammer": grantWallBreakerShots(player); return true;
      case "mine": grantMines(player); return true;
      case "satellite": return grantSatelliteCharge(player);
      default: return false;
    }
  }

  resolveTankCollisions() {
    for (let aIndex = 0; aIndex < this.players.length; aIndex += 1) {
      const a = this.players[aIndex];
      if (!a.alive) continue;
      for (let bIndex = aIndex + 1; bIndex < this.players.length; bIndex += 1) {
        const b = this.players[bIndex];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distance = Math.hypot(dx, dz);
        if (distance <= 0.001 || distance >= TANK_RADIUS * 2) continue;
        const push = (TANK_RADIUS * 2 - distance) / 2;
        a.x -= dx / distance * push;
        a.z -= dz / distance * push;
        b.x += dx / distance * push;
        b.z += dz / distance * push;
        a.drive.speed *= 0.45;
        b.drive.speed *= 0.45;
      }
    }
  }

  checkWinner() {
    for (const team of ["alpha", "omega"]) {
      const defeated = this.players
        .filter((player) => player.team === team)
        .every((player) => player.lives <= 0);
      if (!defeated) continue;
      this.ended = true;
      this.winner = team === "alpha" ? "omega" : "alpha";
      this.emit("matchEnd", { winner: this.winner });
      this.onSnapshot(this.snapshot());
      this.onEnd(this.winner);
      this.stop();
      break;
    }
  }

  emit(type, data = {}) {
    this.events.push({ id: ++this.eventSequence, type, ...data });
    if (this.events.length > 40) this.events.splice(0, this.events.length - 40);
  }

  snapshot() {
    return {
      type: "snapshot",
      matchId: this.id,
      serverTime: this.elapsed,
      ended: this.ended,
      winner: this.winner,
      players: this.players.map((player) => ({
        id: player.id,
        name: player.name,
        team: player.team,
        slot: player.slot,
        profileId: player.profileId,
        isBot: player.isBot,
        connected: player.connected,
        x: player.x,
        z: player.z,
        heading: player.heading,
        speed: player.drive.speed,
        turretYaw: player.turretYaw,
        barrelPitch: player.barrelPitch,
        alive: player.alive,
        invulnerable: player.invulnerable,
        lives: player.lives,
        maxLives: player.maxLives,
        armor: player.armor,
        ammo: player.ammo,
        lethalShots: player.lethalShots,
        wallBreakerShots: player.wallBreakerShots,
        mines: player.mines,
        satelliteCharges: player.satelliteCharges,
        satelliteUntil: player.satelliteUntil,
        shieldType: player.shieldType,
        shieldUntil: player.shieldUntil,
        shieldHits: player.shieldHits,
      })),
      shells: this.shells.map((shell) => ({
        id: shell.id,
        ownerId: shell.ownerId,
        x: shell.x,
        y: shell.y,
        z: shell.z,
        lethal: shell.lethal,
        wallBreaker: shell.wallBreaker,
      })),
      mines: this.mines.map((mine) => ({
        id: mine.id,
        ownerId: mine.ownerId,
        x: mine.x,
        z: mine.z,
        armed: this.elapsed >= mine.armedAt,
      })),
      powerups: this.powerups.map((powerup) => ({
        id: powerup.id,
        type: powerup.type,
        active: powerup.active,
        x: powerup.x,
        z: powerup.z,
      })),
      destroyedWalls: this.walls.reduce((indices, wall, index) => {
        if (wall.destroyed) indices.push(index);
        return indices;
      }, []),
      events: this.events,
    };
  }
}
