# tools/tests/test_build_output.py
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import glb_io
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "tank.glb")

def test_named_nodes_and_belt_material():
    g = glb_io.load_glb(OUT)
    names = [n.get("name","") for n in g.json["nodes"]]
    for need in ["Hull","Turret","Barrel","BeltLeft","BeltRight"]:
        assert need in names, f"missing node {need}"
    assert sum(n.startswith("WheelL") for n in names) >= 1, "no left wheels"
    assert sum(n.startswith("WheelR") for n in names) >= 1, "no right wheels"
    mats = {m.get("name") for m in g.json["materials"]}
    assert "TrackBelt" in mats, "missing TrackBelt material"
    belt_mat = [i for i,m in enumerate(g.json["materials"]) if m.get("name")=="TrackBelt"][0]
    for n in g.json["nodes"]:
        if n.get("name","").startswith("Belt"):
            mesh = g.json["meshes"][n["mesh"]]
            assert mesh["primitives"][0]["material"] == belt_mat, "belt not using TrackBelt"

if __name__ == "__main__":
    test_named_nodes_and_belt_material(); print("build output OK")
