# tools/beltuv.py
import numpy as np

def arc_length_uv(pos, center_xy, repeats, z_min, z_max):
    """U: angle about (cx,cy) in X-Y -> [0,repeats). V: across width via Z -> [0,1].
    pos: (N,3). Returns (N,2) float32."""
    cx, cy = center_xy
    dx = pos[:,0] - cx
    dy = pos[:,1] - cy
    ang = np.arctan2(dy, dx)          # [-pi, pi]
    frac = (ang + np.pi) / (2*np.pi)  # [0,1)
    u = frac * repeats
    az = np.abs(pos[:,2])
    v = np.clip((az - z_min) / (z_max - z_min + 1e-9), 0.0, 1.0)
    return np.column_stack([u, v]).astype(np.float32)

def loop_center(belt_pos):
    """Reasonable loop center for a side: median X, mid Y of the belt verts."""
    cx = float(np.median(belt_pos[:,0]))
    cy = float((belt_pos[:,1].min() + belt_pos[:,1].max()) * 0.5)
    return (cx, cy)
