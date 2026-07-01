export const TANK_PROFILES = Object.freeze({
  blue: Object.freeze({
    id: "blue",
    name: "BLUE",
    accent: 0x15e7ff,
    spawn: Object.freeze({ x: -58, z: -58, heading: 0.75 }),
    enabled: true,
  }),
  red: Object.freeze({
    id: "red",
    name: "RED",
    accent: 0xff3048,
    spawn: Object.freeze({ x: 58, z: 58, heading: -2.4 }),
    enabled: true,
  }),
  yellow: Object.freeze({
    id: "yellow",
    name: "YELLOW",
    accent: 0xffd21f,
    spawn: Object.freeze({ x: 58, z: -58, heading: -0.75 }),
    enabled: false,
  }),
  green: Object.freeze({
    id: "green",
    name: "GREEN",
    accent: 0x39ff88,
    spawn: Object.freeze({ x: -58, z: 58, heading: 2.4 }),
    enabled: false,
  }),
});

export const ACTIVE_MATCH_TANK_IDS = Object.freeze(["blue", "red"]);

export function getTankProfile(id) {
  const profile = TANK_PROFILES[id];
  if (!profile) throw new Error(`Unknown tank profile: ${id}`);
  return profile;
}
