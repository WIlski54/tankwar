import {
  ARENA_EXPANSION,
  ARENA_SECTOR_SIZE,
  ARENA_SIZE,
} from "./arena-config.js";

const wall = (x, z, hw, hd, destructible = true) => ({
  x,
  z,
  hw,
  hd,
  destructible,
  destroyed: false,
  visualBindings: [],
  edgeBindings: [],
});

const SECTOR_WALLS = Object.freeze([
  wall(-48, -39, 1.2, 18), wall(-48, 29, 1.2, 22),
  wall(-25, -12, 18, 1.2), wall(-17, 51, 23, 1.2),
  wall(0, -49, 1.2, 16), wall(0, 21, 1.2, 18),
  wall(25, -20, 18, 1.2), wall(23, 49, 18, 1.2),
  wall(48, -42, 1.2, 18), wall(48, 29, 1.2, 22),
  wall(-24, -52, 10, 1.2), wall(24, 55, 10, 1.2),
  wall(-54, 4, 11, 1.2), wall(54, -4, 11, 1.2),
]);

function transformedWall(source, offsetX, offsetZ, quarterTurns) {
  let { x, z, hw, hd } = source;
  for (let turn = 0; turn < quarterTurns; turn += 1) {
    [x, z] = [-z, x];
    [hw, hd] = [hd, hw];
  }
  return wall(x + offsetX, z + offsetZ, hw, hd, source.destructible);
}

export function createArenaWalls() {
  const walls = [];
  const sectorRadius = Math.floor(ARENA_EXPANSION / 2);
  for (let sectorZ = -sectorRadius; sectorZ <= sectorRadius; sectorZ += 1) {
    for (let sectorX = -sectorRadius; sectorX <= sectorRadius; sectorX += 1) {
      const turns = Math.abs(sectorX * 2 + sectorZ * 3) % 4;
      for (const source of SECTOR_WALLS) {
        walls.push(transformedWall(
          source,
          sectorX * ARENA_SECTOR_SIZE,
          sectorZ * ARENA_SECTOR_SIZE,
          turns,
        ));
      }
    }
  }

  const half = ARENA_SIZE / 2;
  const portalHalfWidth = 10;
  const segmentHalf = (half - portalHalfWidth) / 2;
  const segmentCenter = (half + portalHalfWidth) / 2;
  walls.push(
    wall(-segmentCenter, -half, segmentHalf, 1, false),
    wall(segmentCenter, -half, segmentHalf, 1, false),
    wall(-segmentCenter, half, segmentHalf, 1, false),
    wall(segmentCenter, half, segmentHalf, 1, false),
    wall(-half, -segmentCenter, 1, segmentHalf, false),
    wall(-half, segmentCenter, 1, segmentHalf, false),
    wall(half, -segmentCenter, 1, segmentHalf, false),
    wall(half, segmentCenter, 1, segmentHalf, false),
  );
  return walls;
}
