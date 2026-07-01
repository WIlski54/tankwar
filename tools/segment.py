# tools/segment.py
import numpy as np
from dataclasses import dataclass

HULL, TURRET, BARREL, WHEELS_L, WHEELS_R, BELT_L, BELT_R = range(7)
PART_NAMES = {HULL:"Hull",TURRET:"Turret",BARREL:"Barrel",
              WHEELS_L:"WheelsLeft",WHEELS_R:"WheelsRight",
              BELT_L:"BeltLeft",BELT_R:"BeltRight"}

@dataclass
class Config:
    front_sign: int = 1       # +1 if barrel points +X (from Task 3)
    belt_z_min: float = 0.40  # |Z| >= belt outer shell (Task 3)
    band_y_max: float = 0.04  # running gear sits below this Y
    side_z_min: float = 0.20  # |Z| >= this counts as a side (not center hull)
    turret_y_min: float = 0.15
    barrel_z_max: float = 0.10
    barrel_x_min: float = 0.55  # barrel reaches beyond this |X| at turret height
    barrel_y_min: float = 0.03  # tube underside sits below the turret threshold
    barrel_y_max: float = 0.18

def side_of(z, thr=0.20):
    return 1 if z > thr else (-1 if z < -thr else 0)

def classify(pos, idx, cfg: Config):
    """Return per-triangle label by centroid."""
    cen = pos[idx].mean(axis=1)
    X,Y,Z = cen[:,0],cen[:,1],cen[:,2]
    n = len(cen)
    lab = np.full(n, HULL, dtype=np.int32)

    # Turret: upper-central mass
    turret = (Y > cfg.turret_y_min) & (np.abs(Z) < cfg.side_z_min + 0.05)
    lab[turret] = TURRET
    # Barrel: thin forward tube. It deliberately does not depend on the turret mask:
    # the tube underside is lower than turret_y_min and otherwise remains in Hull.
    barrel = (np.abs(Z) < cfg.barrel_z_max) & \
             (cfg.front_sign * X > cfg.barrel_x_min) & \
             (Y > cfg.barrel_y_min) & (Y < cfg.barrel_y_max)
    lab[barrel] = BARREL

    # Running gear band (below body, on a side)
    band = (Y < cfg.band_y_max) & (np.abs(Z) > cfg.side_z_min)
    belt = band & (np.abs(Z) >= cfg.belt_z_min)
    wheel = band & (np.abs(Z) < cfg.belt_z_min)
    lab[belt  & (Z>0)] = BELT_L
    lab[belt  & (Z<0)] = BELT_R
    lab[wheel & (Z>0)] = WHEELS_L
    lab[wheel & (Z<0)] = WHEELS_R
    return lab

def part_indices(labels, part):
    """Triangle indices (rows) for a part."""
    return np.nonzero(labels == part)[0]
