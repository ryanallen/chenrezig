"""Make 3D models of the statue and the offerings from Codex's paintings of them, in Blender.

    blender -b -P source/blender/models.py [-- name ...]

Each model is a closed mesh in the painting's own frame: x from -0.5 to 0.5 across the painting, y up from its foot
(0 to height / width), z toward the viewer. Its outline is the painting's, the green background keyed out. Its depth
comes from its width: each row's run of the object becomes a round cross-section, as deep as it is wide (so a bowl
is round, each incense stick a thin rod, each petal its own), times the object's roundness; flat things (the mirror,
the cymbals, the nga drum) are flattened. The statue's front is its own sculpted depth map. The painting is projected
on from the front, so every vertex's texture coordinates are where it lies in the painting. Blender joins the front
and back, smooths, decimates and exports each as concept-art/models/<name>.glb, and renders
concept-art/models/<name>-preview.png from three quarters to check it.
"""
import math
import sys
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'concept-art' / 'models'
OUT.mkdir(exist_ok=True)

# roundness: 1 as deep as wide, less for flatter things
ROUND = {
    'incense-burner': 1, 'flowers': 0.9, 'mandala': 1, 'fruit': 1, 'khapse': 0.8, 'torma': 1, 'conch': 0.8,
    'mirror': 0.18, 'silks': 0.6, 'bell-dorje': 0.8, 'damaru': 0.7, 'cymbals': 0.35, 'nga-drum': 0.3,
    'saffron-water': 1, 'grain': 1, 'mani-pills': 1, 'jewel-bowl': 1, 'norbu': 0.6, 'treasure-vase': 1,
    'gold-silver': 0.7, 'coral-turquoise': 0.8, 'crystal': 0.8,
}
STEP = 4  # grid spacing in painting pixels


def load(path):
    im = bpy.data.images.load(str(path))
    w, h = im.size
    a = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(a)
    bpy.data.images.remove(im)
    return a.reshape(h, w, 4)[::-1]  # rows from the top


def runs_depth(mask):
    """Per pixel: sqrt(a^2 - rho^2), a the half length of its row's run, rho its distance from the run's middle."""
    h, w = mask.shape
    z = np.zeros(mask.shape, np.float32)
    for y in range(h):
        row = mask[y]
        if not row.any():
            continue
        d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
        starts, ends = np.where(d == 1)[0], np.where(d == -1)[0]
        for s, e in zip(starts, ends):
            a = (e - s) / 2
            x = np.arange(s, e) + 0.5 - (s + e) / 2
            z[y, s:e] = np.sqrt(np.maximum(a * a - x * x, 0))
    return z


def blur(z, r):
    k = np.exp(-np.arange(-2 * r, 2 * r + 1) ** 2 / (2 * r * r)); k /= k.sum()
    z = np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 0, z)
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'same'), 1, z)


def build(name, colour, depth=None, front_scale=None):
    img = load(colour)
    h, w = img.shape[:2]
    r, g, b = img[..., 0], img[..., 1], img[..., 2]
    mask = ~((g > 0.5) & (g > r * 1.6) & (g > b * 1.6))
    # keep only the object (drop specks): rows and columns of the grid
    gy, gx = np.arange(0, h, STEP), np.arange(0, w, STEP)
    m = mask[np.ix_(gy, gx)]
    z = runs_depth(mask) / w  # in painting widths
    z = blur(z, 2)[np.ix_(gy, gx)] * ROUND.get(name, 1)
    if depth is not None:  # the statue: its front is its depth map, its back half-round
        d = load(depth)[..., 0]
        front = blur(d, 1.5)[np.ix_(gy, gx)] * front_scale
        back = -np.minimum(z * 0.5, 0.12)
    else:
        front, back = z, -z
        dpath = Path(str(colour).replace('.png', '-depth.png'))
        if dpath.exists():
            # the fine relief from Codex's depth map (each bead, grain, fruit, petal and carved band as its own bump):
            # the depth less its own broad shape, added to the round body's front
            d = load(dpath)[..., 0]
            detail = (blur(d, 1) - blur(d, 10))[np.ix_(gy, gx)]
            front = front + detail * 0.06
        # and from the painting's own shading: each bead, grain and fruit is lit bright and shaded dark at its edge,
        # so its brightness less the local average stands it out as a bump
        lum = img[..., 0] * 0.3 + img[..., 1] * 0.59 + img[..., 2] * 0.11
        lum = np.where(mask, lum, 0)
        front = front + (blur(lum, 1) - blur(lum, 6))[np.ix_(gy, gx)] * 0.035
    # the outline at depth 0 on both sides, so front and back meet there with no crack
    inner = m.copy()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        inner &= np.roll(m, (dy, dx), (0, 1))
    front = np.where(inner, front, 0); back = np.where(inner, back, 0)
    ny, nx = m.shape
    cut = None
    if depth is not None:
        # Where the depth jumps (an arm in front of the halo behind it), the front is cut instead of joined by a wall
        # the painting would stretch down, so the arm stands free; and the arm's edge rounds back like the side of a
        # real arm: a quarter circle of R grid steps, pulled back most at the edge.
        JUMP, R = 0.075, 5
        edge = np.zeros_like(m)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            edge |= inner & ((front - np.roll(front, (dy, dx), (0, 1))) > JUMP)
        dist = np.where(edge, 0., np.inf)
        for _ in range(R):
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                dist = np.minimum(dist, np.roll(dist, (dy, dx), (0, 1)) + 1)
        s = np.clip(dist / R, 0, 1)
        front = front - R * STEP / w * (1 - np.sqrt(1 - (1 - s) ** 2))
        cut = JUMP
    X = (gx / w - 0.5)[None, :].repeat(ny, 0)
    Y = ((h - gy) / w)[:, None].repeat(nx, 1)
    U = (gx / w)[None, :].repeat(ny, 0)
    V = (1 - gy / h)[:, None].repeat(nx, 1)
    verts, uvs, faces = [], [], []
    for side, Z in ((0, front), (1, back)):
        idx = -np.ones((ny, nx), np.int64)
        for j in range(ny):
            for i in range(nx):
                if m[j, i]:
                    idx[j, i] = len(verts)
                    verts.append((X[j, i], -Z[j, i], Y[j, i]))  # Blender is z-up, the viewer at -y
                    uvs.append((U[j, i], V[j, i]))
        for j in range(ny - 1):
            for i in range(nx - 1):
                a, b2, c, d2 = idx[j, i], idx[j, i + 1], idx[j + 1, i + 1], idx[j + 1, i]
                tri = [(a, d2, c), (a, c, b2)] if side == 0 else [(a, c, d2), (a, b2, c)]
                for t in tri:
                    if min(t) >= 0:
                        if cut is not None and side == 0:
                            zs = [-verts[k][1] for k in t]
                            if max(zs) - min(zs) > cut * 1.2:
                                continue
                        faces.append(t)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uv = me.uv_layers.new(name='UV')
    loop_uv = np.array([uvs[v] for poly in me.polygons for v in poly.vertices], np.float32)
    uv.data.foreach_set('uv', loop_uv.ravel())
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=1e-5)  # the front and back meet at the outline
    if cut is not None:  # the cuts leave a few tiny loose islands, shards seen from the side: delete them
        import bmesh
        bm = bmesh.from_edit_mesh(ob.data); bm.faces.ensure_lookup_table(); seen, gone = set(), []
        for f0 in bm.faces:
            if f0 in seen:
                continue
            isl, stack = [], [f0]; seen.add(f0)
            while stack:
                f1 = stack.pop(); isl.append(f1)
                for e in f1.edges:
                    for f2 in e.link_faces:
                        if f2 not in seen:
                            seen.add(f2); stack.append(f2)
            if len(isl) < 200:
                gone += isl
        bmesh.ops.delete(bm, geom=gone, context='FACES')
        bmesh.update_edit_mesh(ob.data)
    bpy.ops.object.mode_set(mode='OBJECT')
    dec = ob.modifiers.new('decimate', 'DECIMATE')
    dec.ratio = min(1, (20000 if name == "statue" else 6000) / len(ob.data.vertices))  # small enough to stream
    bpy.ops.object.modifier_apply(modifier='decimate')
    bpy.ops.object.shade_smooth()
    return ob, colour


def padded(colour):
    """The painting with the object's colours spread out over the green, so the outline never samples green."""
    a = load(colour)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    key = (g > 0.5) & (g > r * 1.6) & (g > b * 1.6)
    c = a[..., :3].copy(); have = ~key
    for _ in range(12):
        acc = np.zeros_like(c); n = np.zeros(have.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            hs = np.roll(have, (dy, dx), (0, 1)); acc += np.roll(c, (dy, dx), (0, 1)) * hs[..., None]; n += hs
        fill = ~have & (n > 0)
        c[fill] = acc[fill] / n[fill][:, None]; have |= fill
    h, w = key.shape
    im = bpy.data.images.new('padded', w, h)
    out = np.concatenate([c, np.ones((h, w, 1), np.float32)], 2)[::-1].ravel()
    im.pixels.foreach_set(out)
    return im


def preview(ob, colour):
    """A three-quarter render with the painting on, to check the model."""
    mat = bpy.data.materials.new('m'); mat.use_nodes = True
    nt = mat.node_tree; bsdf = nt.nodes['Principled BSDF']
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = padded(colour)
    nt.links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    ob.data.materials.append(mat)
    sc = bpy.context.scene
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam)
    top = max(v.co.z for v in ob.data.vertices)
    cam.location = (1.5, -1.9, top * 0.5 + 0.55)
    aim = bpy.data.objects.new('aim', None); aim.location = (0, 0, top * 0.45); sc.collection.objects.link(aim)
    tr = cam.constraints.new('TRACK_TO'); tr.target = aim; tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    cam.data.lens = 70
    sc.camera = cam
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3
    sun.rotation_euler = (0.9, 0.3, 0.6); sc.collection.objects.link(sun)
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.world = sc.world or bpy.data.worlds.new('w'); sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.08, 0.08, 0.09, 1)
    sc.render.filepath = str(OUT / f'{ob.name}-preview.png')
    bpy.ops.render.render(write_still=True)
    for o in (cam, sun, aim):
        bpy.data.objects.remove(o)


def export(ob):
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f'{ob.name}.glb'), export_format='GLB', use_selection=True,
                              export_normals=True, export_texcoords=True, export_materials='NONE', export_yup=True)


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


names = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['statue'] + list(ROUND)
for n in names:
    clear()
    if n == 'statue':
        ob, col = build('statue', ROOT / 'concept-art/textures/statue.png', ROOT / 'concept-art/textures/statue-depth.png', 0.25)
    else:
        ob, col = build(n, ROOT / 'concept-art/offerings' / f'{n}.png')
    export(ob)
    preview(ob, col)
    print('made', n, len(ob.data.vertices), 'vertices', len(ob.data.polygons), 'faces')
