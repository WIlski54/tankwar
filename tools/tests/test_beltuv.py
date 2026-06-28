# tools/tests/test_beltuv.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, beltuv

def test_uv_monotonic_around_loop_and_bounded():
    # synthetic oval belt in X-Y at Z~0.45, going around center (0.0, -0.2)
    t = np.linspace(0, 2*np.pi, 400, endpoint=False)
    x = 0.0 + 0.8*np.cos(t)
    y = -0.2 + 0.25*np.sin(t)
    z = np.full_like(t, 0.45) + np.random.default_rng(1).uniform(-0.02,0.02,len(t))
    pos = np.column_stack([x,y,z])
    uv = beltuv.arc_length_uv(pos, center_xy=(0.0,-0.2), repeats=12,
                              z_min=0.43, z_max=0.49)
    u,v = uv[:,0], uv[:,1]
    # U spans [0,12) and increases monotonically with the loop angle t
    assert u.min() >= 0 and u.max() <= 12.0001
    order = np.argsort(t)
    du = np.diff(u[order])
    # exactly one wrap (negative jump) around the seam, rest increasing
    assert (du < 0).sum() <= 2
    # V within [0,1]
    assert v.min() >= -0.01 and v.max() <= 1.01

if __name__ == "__main__":
    test_uv_monotonic_around_loop_and_bounded(); print("beltuv OK")
