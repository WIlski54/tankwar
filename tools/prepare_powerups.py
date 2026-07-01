"""Optimize the supplied Meshy power-up GLBs for real-time use.

Run with Blender:
  blender --background --python tools/prepare_powerups.py -- input.glb output.glb
"""

import math
import os
import sys

import bpy
from mathutils import Vector


def arguments():
    marker = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    values = sys.argv[marker + 1 :]
    if len(values) != 2:
        raise SystemExit("Expected input.glb and output.glb")
    return map(os.path.abspath, values)


def scene_bounds(objects):
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in objects
        if obj.type == "MESH"
        for corner in obj.bound_box
    ]
    low = Vector(min(point[i] for point in points) for i in range(3))
    high = Vector(max(point[i] for point in points) for i in range(3))
    return low, high


source, destination = arguments()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
for obj in meshes:
    polygon_count = len(obj.data.polygons)
    if polygon_count > 45_000:
        modifier = obj.modifiers.new("Realtime decimation", "DECIMATE")
        modifier.ratio = 45_000 / polygon_count
        modifier.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(False)

for image in bpy.data.images:
    if image.size[0] <= 0 or image.size[1] <= 0:
        continue
    scale = min(1.0, 1024 / max(image.size))
    if scale < 1:
        image.scale(max(1, round(image.size[0] * scale)), max(1, round(image.size[1] * scale)))
    image.pack()

low, high = scene_bounds(meshes)
center = (low + high) * 0.5
size = max(high - low)
for obj in bpy.context.scene.objects:
    if obj.parent is None:
        obj.location -= center

# All pickups share a predictable two-unit envelope and rest on y=0 in Three.js.
normalization = 2.0 / size
for obj in bpy.context.scene.objects:
    if obj.parent is None:
        obj.scale *= normalization

os.makedirs(os.path.dirname(destination), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=destination,
    export_format="GLB",
    export_apply=True,
    export_image_format="AUTO",
    export_image_quality=82,
    export_materials="EXPORT",
    export_yup=True,
)

print(f"Prepared {os.path.basename(source)} -> {destination}")
