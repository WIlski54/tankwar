export const SATELLITE_DURATION = 12;

export const POWERUP_POOL_COUNTS = Object.freeze({
  local: Object.freeze({
    health: 2,
    life: 1,
    ammo: 3,
    shield: 2,
    reflect: 1,
    lethal: 1,
    hammer: 1,
    mine: 2,
    satellite: 1,
  }),
  network: Object.freeze({
    health: 3,
    life: 1,
    ammo: 4,
    shield: 2,
    reflect: 1,
    lethal: 1,
    hammer: 2,
    mine: 3,
    satellite: 1,
  }),
});

export function expandPowerupPool(preset = "local") {
  const counts = typeof preset === "string" ? POWERUP_POOL_COUNTS[preset] : preset;
  if (!counts) throw new Error(`Unknown power-up pool: ${preset}`);
  return Object.entries(counts).flatMap(([type, count]) => (
    Array.from({ length: count }, (_, index) => ({
      id: `${type}-${index}`,
      type,
    }))
  ));
}
