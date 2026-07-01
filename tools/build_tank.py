# tools/build_tank.py
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, glb_io, segment as S, beltuv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "Meshy_AI_Crimson_Circuit_Tank_0628104638_texture2.glb")
OUT  = os.path.join(ROOT, "assets", "tank_base.glb")

# Parameters confirmed in Task 3 (front = -X)
# The rotating superstructure starts at Y~0.03. A higher threshold leaves the lower
# faces of the cannon and turret in Hull, producing a stationary "ghost barrel" when
# aiming. The wide Z gate keeps the actual running chassis out of the rotating assembly.
CFG = S.Config(front_sign=-1, belt_z_min=0.40, band_y_max=0.04,
               side_z_min=0.20, turret_y_min=0.03,
               barrel_x_min=0.15, barrel_z_max=0.20)
BELT_REPEATS = 28
N_WHEELS = 7   # road wheels per side (from the side render)

def main():
    g = glb_io.load_glb(SRC)
    prim = g.json["meshes"][0]["primitives"][0]
    pos = glb_io.read_accessor(g, prim["attributes"]["POSITION"]).astype(np.float32)
    nrm = glb_io.read_accessor(g, prim["attributes"]["NORMAL"]).astype(np.float32)
    uv0 = glb_io.read_accessor(g, prim["attributes"]["TEXCOORD_0"]).astype(np.float32)
    idx = glb_io.read_accessor(g, prim["indices"]).reshape(-1,3).astype(np.int64)

    labels = S.classify(pos, idx, CFG)
    for p in range(7):
        print(f"  {S.PART_NAMES[p]:11s}: {(labels==p).sum()} tris")

    bw = glb_io.BinWriter()
    out_json = {
        "asset": {"version":"2.0","generator":"tank-wars-build"},
        "scene": 0, "scenes": [{"nodes":[]}],
        "nodes": [], "meshes": [],
        "materials": json.loads(json.dumps(g.json.get("materials",[]))),
        "accessors": bw.accessors, "bufferViews": bw.bufferViews,
        "samplers": json.loads(json.dumps(g.json.get("samplers",[]))),
        "textures": json.loads(json.dumps(g.json.get("textures",[]))),
        "images": [],
        "buffers": [],
    }
    orig_mat = 0

    # re-embed source images into the new buffer (same order -> texture refs stay valid)
    for im in g.json.get("images", []):
        bv = g.json["bufferViews"][im["bufferView"]]
        data = g.bin[bv["byteOffset"]: bv["byteOffset"]+bv["byteLength"]]
        glb_io._pad4(bw.bin); off = len(bw.bin); bw.bin += data
        bv_idx = len(bw.bufferViews)
        bw.bufferViews.append({"buffer":0,"byteOffset":off,"byteLength":len(data)})
        out_json["images"].append({"bufferView":bv_idx,
                                   "mimeType":im.get("mimeType","image/jpeg")})

    belt_mat = len(out_json["materials"])
    out_json["materials"].append({
        "name":"TrackBelt",
        "pbrMetallicRoughness":{"baseColorFactor":[0.05,0.05,0.06,1.0],
                                "metallicFactor":0.0,"roughnessFactor":0.95},
        "doubleSided": True})

    def emit_node(tri_rows, material, node_name, override_uv=None, pivot=None):
        if len(tri_rows) == 0:
            print("  (skip empty)", node_name); return
        tri = idx[tri_rows]
        used = np.unique(tri)
        remap = -np.ones(pos.shape[0], np.int64); remap[used] = np.arange(len(used))
        P = pos[used].astype(np.float32).copy()
        N = nrm[used].astype(np.float32).copy()
        U = (override_uv[used] if override_uv is not None else uv0[used]).astype(np.float32).copy()
        local_idx = remap[tri].reshape(-1).astype(np.uint32)
        translation = [0.0,0.0,0.0]
        if pivot is not None:
            P[:,0]-=pivot[0]; P[:,1]-=pivot[1]; P[:,2]-=pivot[2]
            translation = [float(pivot[0]),float(pivot[1]),float(pivot[2])]
        a_pos = bw.add_accessor(P, "VEC3", 5126, target=34962)
        a_nrm = bw.add_accessor(N, "VEC3", 5126, target=34962)
        a_uv  = bw.add_accessor(U, "VEC2", 5126, target=34962)
        a_idx = bw.add_accessor(local_idx.reshape(-1,1), "SCALAR", 5125, target=34963)
        mesh_idx = len(out_json["meshes"])
        out_json["meshes"].append({"name":node_name,"primitives":[{
            "attributes":{"POSITION":a_pos,"NORMAL":a_nrm,"TEXCOORD_0":a_uv},
            "indices":a_idx,"material":material}]})
        node_idx = len(out_json["nodes"])
        out_json["nodes"].append({"name":node_name,"mesh":mesh_idx,"translation":translation})
        out_json["scenes"][0]["nodes"].append(node_idx)
        print(f"  wrote {node_name}: {len(used)} verts, {len(tri_rows)} tris, pivot={pivot}")

    cen = pos[idx].mean(axis=1)  # triangle centroids (T,3)

    # Hull (static)
    emit_node(S.part_indices(labels, S.HULL), orig_mat, "Hull")

    # Turret + Barrel share one yaw pivot at the turret's horizontal center
    t_rows = S.part_indices(labels, S.TURRET)
    if len(t_rows):
        tc = cen[t_rows]
        tp = [float(np.median(tc[:,0])), float(tc[:,1].min()), float(np.median(tc[:,2]))]
    else:
        tp = [0.0, 0.0, 0.0]
    emit_node(t_rows, orig_mat, "Turret", pivot=tp)
    b_rows = S.part_indices(labels, S.BARREL)
    if len(b_rows):
        bc = cen[b_rows]
        # Rear end of the -X-facing cannon: pitch around the breech, not turret center.
        bp = [float(np.quantile(bc[:,0], 0.995)),
              float(np.median(bc[:,1])), float(np.median(bc[:,2]))]
    else:
        bp = tp
    emit_node(b_rows, orig_mat, "Barrel", pivot=bp)

    # Wheels: split each side into N_WHEELS nodes, each about its own axle
    for part, tag in ((S.WHEELS_L,"L"), (S.WHEELS_R,"R")):
        rows = S.part_indices(labels, part)
        if len(rows) == 0:
            print("  (no wheels)", tag); continue
        wc = cen[rows]
        yc = float(np.median(wc[:,1])); zc = float(np.median(wc[:,2]))
        xmin, xmax = float(wc[:,0].min()), float(wc[:,0].max())
        margin = (xmax - xmin) / (2 * N_WHEELS)
        centers = np.linspace(xmin + margin, xmax - margin, N_WHEELS)
        nearest = np.abs(wc[:,0][:,None] - centers[None,:]).argmin(axis=1)
        for k in range(N_WHEELS):
            sub = rows[nearest == k]
            if len(sub) == 0: continue
            emit_node(sub, orig_mat, f"Wheel{tag}{k}",
                      pivot=[float(centers[k]), yc, zc])

    # Belts: fresh arc-length UVs per side, TrackBelt material
    belt_uv = uv0.copy()
    for part in (S.BELT_L, S.BELT_R):
        rows = S.part_indices(labels, part)
        if len(rows) == 0: continue
        used = np.unique(idx[rows])
        cx, cy = beltuv.loop_center(pos[used])
        belt_uv[used] = beltuv.arc_length_uv(pos[used].astype(np.float64), (cx, cy),
                                             BELT_REPEATS, z_min=CFG.belt_z_min, z_max=0.49)
        print(f"  belt {S.PART_NAMES[part]} loop center ({cx:.3f},{cy:.3f})")
    emit_node(S.part_indices(labels, S.BELT_L), belt_mat, "BeltLeft", override_uv=belt_uv)
    emit_node(S.part_indices(labels, S.BELT_R), belt_mat, "BeltRight", override_uv=belt_uv)

    out_json["buffers"] = [{"byteLength": len(bw.bin)}]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    glb_io.write_glb(OUT, out_json, bytes(bw.bin))
    print("WROTE", OUT, os.path.getsize(OUT), "bytes")

if __name__ == "__main__":
    main()
