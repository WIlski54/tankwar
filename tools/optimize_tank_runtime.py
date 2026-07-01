"""Build a lightweight runtime tank while preserving the rig node hierarchy."""

import os
import sys

import bpy


TARGET_TRIANGLES = 150_000
MAX_TEXTURE_SIZE = 1024


def arguments():
    marker = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    values = sys.argv[marker + 1 :]
    if len(values) != 2:
        raise SystemExit("Expected source.glb and destination.glb")
    return map(os.path.abspath, values)


source, destination = arguments()
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=source)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
triangle_count = sum(len(obj.data.polygons) for obj in meshes)
ratio = min(1.0, TARGET_TRIANGLES / max(1, triangle_count))

for obj in meshes:
    if len(obj.data.polygons) < 40 or ratio >= 0.999:
        continue
    modifier = obj.modifiers.new("Runtime decimation", "DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)

for image in bpy.data.images:
    if image.size[0] <= 0 or image.size[1] <= 0:
        continue
    scale = min(1.0, MAX_TEXTURE_SIZE / max(image.size))
    if scale < 1:
        image.scale(
            max(1, round(image.size[0] * scale)),
            max(1, round(image.size[1] * scale)),
        )
    image.pack()

os.makedirs(os.path.dirname(destination), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=destination,
    export_format="GLB",
    export_apply=False,
    export_image_format="AUTO",
    export_image_quality=84,
    export_materials="EXPORT",
    export_yup=True,
)

final_triangles = sum(len(obj.data.polygons) for obj in meshes)
print(f"Runtime tank: {triangle_count} -> {final_triangles} triangles")
