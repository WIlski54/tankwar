# tools/render_util.py  — minimal dependency-free point-splat renderer
import numpy as np, struct, zlib

def _png(path, rgb):  # rgb: (H,W,3) uint8
    h, w, _ = rgb.shape
    raw = bytearray()
    for y in range(h):
        raw.append(0); raw += rgb[y].tobytes()
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(sig); f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(bytes(raw), 6)))
        f.write(chunk(b"IEND", b""))

def render(pos, normals, path, view="side", W=900, H=600, bg=30):
    """Orthographic point splat shaded by normal·light. view: side|top|front|iso."""
    p = pos.astype(np.float64).copy()
    n = normals.astype(np.float64).copy()
    if view == "side":   # look along +Z; screen x=X, y=Y
        sx, sy, depth = p[:,0], p[:,1], p[:,2]; nl = n
    elif view == "top":  # look along -Y; screen x=X, y=Z
        sx, sy, depth = p[:,0], p[:,2], -p[:,1]; nl = n[:,[0,2,1]]
    elif view == "front":# look along +X; screen x=Z, y=Y
        sx, sy, depth = p[:,2], p[:,1], p[:,0]; nl = n[:,[2,1,0]]
    else:                # iso
        a = np.radians(35); b = np.radians(25)
        sx = p[:,0]*np.cos(a) - p[:,2]*np.sin(a)
        sy = p[:,1]*np.cos(b) + (p[:,0]*np.sin(a)+p[:,2]*np.cos(a))*np.sin(b)
        depth = -(p[:,0]*np.sin(a) + p[:,2]*np.cos(a))
        nl = n
    light = np.array([0.4,0.7,0.6]); light/=np.linalg.norm(light)
    shade = np.clip(nl @ light, 0.1, 1.0)
    pad = 0.06
    def mp(v):
        lo,hi=v.min(),v.max(); return (v-lo)/(hi-lo+1e-9)
    xi = (pad+ (1-2*pad)*mp(sx))*(W-1)
    yi = ((pad+ (1-2*pad)*(1-mp(sy)))*(H-1))
    xi=xi.astype(int); yi=yi.astype(int)
    img = np.full((H,W,3), bg, np.uint8)
    zbuf = np.full((H,W), -1e9)
    order = np.argsort(depth)  # back to front
    for i in order:
        x,y = xi[i], yi[i]
        if 0<=x<W and 0<=y<H and depth[i] > zbuf[y,x]:
            zbuf[y,x]=depth[i]
            c = int(40+200*shade[i]); img[y,x]=(c,c,c)
    _png(path, img)
    return path
