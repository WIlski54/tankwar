import bpy
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, "assets", "tank.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)

print("BLENDER_TANK_INSPECT")
for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
    if obj.type != "MESH":
        continue
    world_points = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    minimum = [min(point[index] for point in world_points) for index in range(3)]
    maximum = [max(point[index] for point in world_points) for index in range(3)]
    print(
        obj.name,
        "verts=", len(obj.data.vertices),
        "location=", tuple(round(value, 5) for value in obj.location),
        "min=", tuple(round(value, 5) for value in minimum),
        "max=", tuple(round(value, 5) for value in maximum),
        "materials=", [material.name for material in obj.data.materials],
    )
