# tools/tests/test_segment.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np, segment as S

def tri_centroids(pos, idx):
    return pos[idx].mean(axis=1)

def test_side_split():
    assert S.side_of(0.45) == 1 and S.side_of(-0.45) == -1 and S.side_of(0.0) == 0

def test_labels_partition_and_belt_wheel():
    # synthetic: hull block (center), two belt shells (|Z|~0.45 low),
    # two wheel clusters (|Z|~0.30 low), turret block (high center)
    rng = np.random.default_rng(0)
    def block(n, cx,cy,cz, sx,sy,sz):
        return np.column_stack([rng.uniform(cx-sx,cx+sx,n),
                                rng.uniform(cy-sy,cy+sy,n),
                                rng.uniform(cz-sz,cz+sz,n)])
    hull   = block(301, 0,0.0,0,   0.8,0.15,0.18)
    turret = block(100, 0,0.25,0,  0.25,0.08,0.18)
    beltL  = block(200, 0,-0.2,0.46, 0.8,0.18,0.02)
    beltR  = block(200, 0,-0.2,-0.46,0.8,0.18,0.02)
    whL    = block(150, 0,-0.2,0.30, 0.7,0.12,0.05)
    whR    = block(150, 0,-0.2,-0.30,0.7,0.12,0.05)
    pos = np.vstack([hull,turret,beltL,beltR,whL,whR]).astype(np.float64)
    idx = np.arange(len(pos)).reshape(-1,3)  # 1 vert per corner -> fake tris
    cfg = S.Config(front_sign=1, belt_z_min=0.40, band_y_max=0.04,
                   side_z_min=0.20, turret_y_min=0.15)
    labels = S.classify(pos, idx, cfg)
    cen = tri_centroids(pos, idx)
    # a triangle whose centroid is clearly in beltL must be BELT_L
    bl = labels[(cen[:,2]>0.43)&(cen[:,1]<0)]
    assert (bl == S.BELT_L).mean() > 0.9
    wl = labels[(cen[:,2]>0.27)&(cen[:,2]<0.33)&(cen[:,1]<0)]
    assert (wl == S.WHEELS_L).mean() > 0.8
    tu = labels[(cen[:,1]>0.18)]
    assert (tu == S.TURRET).mean() > 0.8
    assert set(np.unique(labels)).issubset(set(range(7)))

def test_low_barrel_is_not_left_in_hull():
    # The real tube underside is below turret_y_min and must still rotate with it.
    pos = np.array([
        [0.70, 0.05, -0.03], [0.72, 0.06, 0.03], [0.75, 0.05, 0.00],
        [0.00, 0.05, -0.03], [0.02, 0.06, 0.03], [0.05, 0.05, 0.00],
    ])
    idx = np.array([[0, 1, 2], [3, 4, 5]])
    labels = S.classify(pos, idx, S.Config(front_sign=1, turret_y_min=0.15))
    assert labels[0] == S.BARREL
    assert labels[1] == S.HULL

if __name__ == "__main__":
    test_side_split(); print("side OK")
    test_labels_partition_and_belt_wheel(); print("labels OK")
    test_low_barrel_is_not_left_in_hull(); print("low barrel OK")
