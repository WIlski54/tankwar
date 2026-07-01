import { ARENA_SIZE } from "./arena-config.js";

const HALF_ARENA = ARENA_SIZE / 2;
const EXIT_INSET = 11;

export const PORTALS = Object.freeze([
  Object.freeze({
    id: "north",
    x: 0,
    z: -HALF_ARENA,
    heading: 0,
    exitX: 0,
    exitZ: -HALF_ARENA + EXIT_INSET,
    color: 0x15e7ff,
  }),
  Object.freeze({
    id: "east",
    x: HALF_ARENA,
    z: 0,
    heading: -Math.PI / 2,
    exitX: HALF_ARENA - EXIT_INSET,
    exitZ: 0,
    color: 0xff2bd6,
  }),
  Object.freeze({
    id: "south",
    x: 0,
    z: HALF_ARENA,
    heading: Math.PI,
    exitX: 0,
    exitZ: HALF_ARENA - EXIT_INSET,
    color: 0xffa21f,
  }),
  Object.freeze({
    id: "west",
    x: -HALF_ARENA,
    z: 0,
    heading: Math.PI / 2,
    exitX: -HALF_ARENA + EXIT_INSET,
    exitZ: 0,
    color: 0x7dff5c,
  }),
]);

export function findEnteredPortal(position, overshoot = 1.5) {
  if (position.z < -HALF_ARENA - overshoot) return PORTALS[0];
  if (position.x > HALF_ARENA + overshoot) return PORTALS[1];
  if (position.z > HALF_ARENA + overshoot) return PORTALS[2];
  if (position.x < -HALF_ARENA - overshoot) return PORTALS[3];
  return null;
}

export function choosePortalExit(entryId, random = Math.random) {
  const exits = PORTALS.filter((portal) => portal.id !== entryId);
  const index = Math.min(exits.length - 1, Math.floor(random() * exits.length));
  return exits[index];
}
