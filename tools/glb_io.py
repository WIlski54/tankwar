# tools/glb_io.py
import struct, json
import numpy as np

CT_SIZE = {5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}
CT_NP   = {5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NCOMP   = {"SCALAR":1,"VEC2":2,"VEC3":3,"VEC4":4,"MAT4":16}

class GLB:
    def __init__(self, json_dict, bin_bytes):
        self.json = json_dict
        self.bin = bin_bytes

def load_glb(path):
    with open(path, "rb") as f:
        data = f.read()
    magic, ver, length = struct.unpack_from("<III", data, 0)
    assert magic == 0x46546C67, "not a glb"
    assert ver == 2, f"unsupported GLB version {ver}"
    off = 12; jc = bc = None
    while off < length:
        clen, ctype = struct.unpack_from("<II", data, off); off += 8
        chunk = data[off:off+clen]; off += clen
        if ctype == 0x4E4F534A: jc = chunk
        elif ctype == 0x004E4942: bc = chunk
    if jc is None:
        raise ValueError(f"No JSON chunk found in {path!r}")
    return GLB(json.loads(jc.decode("utf-8")), bc or b"")

def read_accessor(g, idx):
    acc = g.json["accessors"][idx]
    bv = g.json["bufferViews"][acc["bufferView"]]
    comp = acc["componentType"]; nc = NCOMP[acc["type"]]; count = acc["count"]
    dtype = CT_NP[comp]; csize = CT_SIZE[comp]
    base = bv.get("byteOffset",0) + acc.get("byteOffset",0)
    stride = bv.get("byteStride", csize*nc)
    if stride == csize*nc:
        flat = np.frombuffer(g.bin, dtype=dtype, count=count*nc, offset=base)
        return flat.reshape(count, nc).copy()
    out = np.empty((count, nc), dtype=dtype)
    for i in range(count):
        out[i] = np.frombuffer(g.bin, dtype=dtype, count=nc, offset=base+i*stride)
    return out

def _pad4(b: bytearray):
    while len(b) % 4: b.append(0)

class BinWriter:
    """Accumulates accessors+bufferViews into a single packed buffer."""
    def __init__(self):
        self.bin = bytearray(); self.bufferViews = []; self.accessors = []
    def add_accessor(self, arr, type_str, comp_type, target=None, normalized=False):
        arr = np.ascontiguousarray(arr, dtype=CT_NP[comp_type])
        _pad4(self.bin)
        offset = len(self.bin)
        self.bin += arr.tobytes()
        bv = {"buffer":0, "byteOffset":offset, "byteLength":arr.nbytes}
        if target: bv["target"] = target
        bv_idx = len(self.bufferViews); self.bufferViews.append(bv)
        count = arr.shape[0]
        acc = {"bufferView":bv_idx, "componentType":comp_type,
               "count":count, "type":type_str}
        # min/max required for POSITION; harmless elsewhere for VEC3 floats
        if type_str in ("VEC3","VEC2","SCALAR") and comp_type == 5126:
            acc["min"] = np.atleast_1d(arr.min(axis=0)).astype(float).tolist()
            acc["max"] = np.atleast_1d(arr.max(axis=0)).astype(float).tolist()
        if normalized: acc["normalized"] = True
        acc_idx = len(self.accessors); self.accessors.append(acc)
        return acc_idx

def write_glb(path, json_dict, bin_bytes):
    jb = json.dumps(json_dict, separators=(",",":")).encode("utf-8")
    while len(jb) % 4: jb += b" "
    bb = bytearray(bin_bytes)
    while len(bb) % 4: bb.append(0)
    total = 12 + 8 + len(jb) + 8 + len(bb)
    with open(path, "wb") as f:
        f.write(struct.pack("<III", 0x46546C67, 2, total))
        f.write(struct.pack("<II", len(jb), 0x4E4F534A)); f.write(jb)
        f.write(struct.pack("<II", len(bb), 0x004E4942)); f.write(bb)
