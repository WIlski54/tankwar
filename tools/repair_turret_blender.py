import bpy
import math
import os
import sys


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SOURCE = os.path.join(ROOT, "assets", "tank_base.glb")
DEFAULT_OUTPUT = os.path.join(ROOT, "assets", "tank.glb")


def command_line_paths():
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    source = os.path.abspath(args[0]) if len(args) >= 1 else DEFAULT_SOURCE
    output = os.path.abspath(args[1]) if len(args) >= 2 else DEFAULT_OUTPUT
    return source, output


def cross(origin, a, b):
    return (a[0] - origin[0]) * (b[1] - origin[1]) - (
        a[1] - origin[1]
    ) * (b[0] - origin[0])


def convex_hull(points):
    unique = sorted(set((round(x, 6), round(y, 6)) for x, y in points))
    if len(unique) <= 3:
        return unique
    lower = []
    for point in unique:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)
    upper = []
    for point in reversed(unique):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)
    return lower[:-1] + upper[:-1]


def resample_closed_polygon(points, count):
    lengths = []
    perimeter = 0.0
    for index, point in enumerate(points):
        nxt = points[(index + 1) % len(points)]
        length = math.hypot(nxt[0] - point[0], nxt[1] - point[1])
        lengths.append(length)
        perimeter += length
    samples = []
    segment = 0
    segment_start = 0.0
    for sample_index in range(count):
        distance = perimeter * sample_index / count
        while distance > segment_start + lengths[segment]:
            segment_start += lengths[segment]
            segment = (segment + 1) % len(points)
        point = points[segment]
        nxt = points[(segment + 1) % len(points)]
        length = max(lengths[segment], 1e-9)
        t = (distance - segment_start) / length
        samples.append(
            (
                point[0] + (nxt[0] - point[0]) * t,
                point[1] + (nxt[1] - point[1]) * t,
            )
        )
    return samples


def create_skirt(turret):
    world_points = [turret.matrix_world @ vertex.co for vertex in turret.data.vertices]
    lower_points = [(point.x, point.y) for point in world_points if point.z <= 0.18]
    hull = convex_hull(lower_points)
    contour = resample_closed_polygon(hull, 48)
    center_x = sum(point[0] for point in contour) / len(contour)
    center_y = sum(point[1] for point in contour) / len(contour)

    # Keep the wall just inside the visible upper shell so no artificial lip protrudes.
    inset = 0.955
    contour = [
        (
            center_x + (point[0] - center_x) * inset,
            center_y + (point[1] - center_y) * inset,
        )
        for point in contour
    ]
    bottom_z = 0.018
    top_z = 0.158
    vertices = (
        [(x, y, bottom_z) for x, y in contour]
        + [(x, y, top_z) for x, y in contour]
    )
    count = len(contour)
    faces = []
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    faces.append(tuple(reversed(range(count))))

    mesh = bpy.data.meshes.new("TurretSkirtMesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    skirt = bpy.data.objects.new("TurretSkirt", mesh)
    bpy.context.collection.objects.link(skirt)
    material = bpy.data.materials.new("TurretSkirtDark")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (0.008, 0.014, 0.02, 1.0)
    principled.inputs["Metallic"].default_value = 0.88
    principled.inputs["Roughness"].default_value = 0.24
    skirt.data.materials.append(material)

    # Vertices were created in world coordinates; preserve them while parenting.
    skirt.parent = turret
    skirt.matrix_parent_inverse = turret.matrix_world.inverted()
    return skirt, contour, bottom_z, top_z


def main():
    source, output = command_line_paths()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    turret = bpy.data.objects.get("Turret")
    if turret is None or turret.type != "MESH":
        raise RuntimeError("Turret mesh not found in imported GLB")

    skirt, contour, bottom_z, top_z = create_skirt(turret)
    print(
        "TURRET_SKIRT",
        "points=", len(contour),
        "bottom=", round(bottom_z, 4),
        "top=", round(top_z, 4),
        "parent=", skirt.parent.name,
    )
    bpy.ops.export_scene.gltf(
        filepath=output,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
    )
    print("WROTE", output, os.path.getsize(output))


if __name__ == "__main__":
    main()
