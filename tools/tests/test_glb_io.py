# tools/tests/test_glb_io.py
import sys, os, struct, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import numpy as np
import glb_io

SRC = os.path.join(os.path.dirname(__file__), "..", "..",
                   "Meshy_AI_Crimson_Circuit_Tank_0628104638_texture2.glb")

def test_load_and_read_position():
    g = glb_io.load_glb(SRC)
    assert "meshes" in g.json
    prim = g.json["meshes"][0]["primitives"][0]
    pos = glb_io.read_accessor(g, prim["attributes"]["POSITION"])
    assert pos.shape == (580630, 3)
    assert pos.dtype == np.float32
    # bbox sanity
    assert abs(pos[:,0].min() + 0.95) < 0.05
    assert abs(pos[:,2].max() - 0.49) < 0.05

def test_roundtrip_write_read():
    # build a tiny GLB with one triangle and read it back
    pos = np.array([[0,0,0],[1,0,0],[0,1,0]], dtype=np.float32)
    idx = np.array([0,1,2], dtype=np.uint32)
    bw = glb_io.BinWriter()
    pos_acc = bw.add_accessor(pos, "VEC3", 5126, target=34962)
    idx_acc = bw.add_accessor(idx.reshape(-1,1), "SCALAR", 5125, target=34963)
    j = {
      "asset":{"version":"2.0"},
      "scenes":[{"nodes":[0]}], "scene":0,
      "nodes":[{"mesh":0}],
      "meshes":[{"primitives":[{"attributes":{"POSITION":pos_acc},"indices":idx_acc}]}],
      "accessors": bw.accessors, "bufferViews": bw.bufferViews,
      "buffers":[{"byteLength": len(bw.bin)}],
    }
    out = os.path.join(os.path.dirname(__file__), "..", "out", "_rt.glb")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    glb_io.write_glb(out, j, bytes(bw.bin))
    g2 = glb_io.load_glb(out)
    p2 = glb_io.read_accessor(g2, 0)
    assert np.allclose(p2, pos)

if __name__ == "__main__":
    test_load_and_read_position(); print("load/read OK")
    test_roundtrip_write_read();   print("roundtrip OK")
