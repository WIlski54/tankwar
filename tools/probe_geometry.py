# tools/probe_geometry.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, glb_io, render_util

SRC = os.path.join(os.path.dirname(__file__), "..",
                   "Meshy_AI_Crimson_Circuit_Tank_0628104638_texture2.glb")
OUT = os.path.join(os.path.dirname(__file__), "out"); os.makedirs(OUT, exist_ok=True)

g = glb_io.load_glb(SRC)
prim = g.json["meshes"][0]["primitives"][0]
pos = glb_io.read_accessor(g, prim["attributes"]["POSITION"]).astype(np.float64)
nrm = glb_io.read_accessor(g, prim["attributes"]["NORMAL"]).astype(np.float64)
X,Y,Z = pos[:,0],pos[:,1],pos[:,2]
print("bbox", pos.min(0), pos.max(0))

# ---- FRONT detection: barrel = thin high protrusion.
upper = pos[Y > 0.10]
for sign,label in ((+1,"+X"),(-1,"-X")):
    sel = upper[(np.sign(upper[:,0])==sign)]
    if len(sel)==0: continue
    far = sel[np.abs(sel[:,0])>0.6]
    narrow = far[np.abs(far[:,2])<0.10]
    print(f"upper end {label}: far={len(far)} narrow-thin(barrel-like)={len(narrow)} "
          f"maxX={np.abs(sel[:,0]).max():.3f}")
print(">> FRONT = the end with the larger 'narrow-thin' count (barrel).")

# ---- Per-side Z cross-section to find belt outer-shell threshold
for sgn,name in ((+1,"LEFT(Z>0)"),(-1,"RIGHT(Z<0)")):
    band = (Y<0.04)&(np.sign(Z)==sgn)&(np.abs(Z)>0.20)
    az = np.abs(Z[band])
    h,e = np.histogram(az, bins=20)
    print(f"\n{name} |Z| profile in lower band:")
    for i in range(20):
        print(f"  {e[i]:.3f} {'#'*int(40*h[i]/h.max())} {h[i]}")
print(">> BELT outer shell = |Z| above the high outer peak; WHEELS = inboard band.")

# ---- Wheel centers: at axle height, X-density peaks
band = (Y<0.0)&(np.abs(Z)>0.20)&(np.abs(Z)<0.40)
yc = np.median(Y[band]); print("\napprox axle height Yc=", round(float(yc),3))
xs = X[band & (np.abs(Y-yc)<0.05)]
h,e = np.histogram(xs, bins=40)
print("X density along axle row (peaks = wheels):")
print(" ", " ".join(f"{v}" for v in h))

# ---- Turret extent (upper-central mass, exclude thin barrel)
tu = pos[(Y>0.12)&(np.abs(Z)<0.25)]
if len(tu):
    print("\nturret-ish (Y>0.12,|Z|<0.25): X[%.3f,%.3f] Y[%.3f,%.3f] Z[%.3f,%.3f] n=%d"%(
        tu[:,0].min(),tu[:,0].max(),tu[:,1].min(),tu[:,1].max(),
        tu[:,2].min(),tu[:,2].max(),len(tu)))

# ---- Renders for visual confirmation
for v in ("side","top","front","iso"):
    p = render_util.render(pos, nrm, os.path.join(OUT, f"tank_{v}.png"), view=v)
    print("wrote", p)
