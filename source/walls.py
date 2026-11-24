"""Hang the real deity images, framed, on Codex's lotus walls.

Every deity on the walls is a real thangka or painting (references/), placed pixel for pixel:
only cropped to the frame's 3 : 4 opening, scaled and toned to the mural's light, so no hand,
implement, posture or garment is redrawn. Each sits in one of Codex's carved frames
(concept-art/frames/frame-<x>-cut.png). All frames are one size and hang on one line, spaced
evenly along each wall, the window and door standing in the row as if they were frames too.
The walls without figures are Codex's (concept-art/walls/wall-<name>-lotus.png); the result is
concept-art/textures/wall-<name>.png, which build.mjs streams into the room.

    python source/walls.py            all four walls
    python source/walls.py east       one wall
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'references'
FRAMES = ROOT / 'concept-art' / 'frames'
OUT_W, OUT_H = 2048, 1215  # the build's largest wall size, the walls' own 1628 x 966 shape; 256 px a metre
FRAME_H = 519              # every frame's height on the wall, 2.03 m: five fit along the south wall
ROW_MID = 620              # the row's middle, the middle of the painted field between the borders
WINDOW = (532, 952)        # the east window with its painted frame, x in px
DOOR = (1198, 1597)        # the west door with its painted frame

# Each picture: source image and its crop (left, top, right, bottom as fractions: the painting
# without its mount or text).
PICTURES = {
    'thousand-armed-chenrezig': ('garchen/thousand-armed-chenrezig-1.jpg', (0, 0, 1, 1)),
    'refuge-tree': ('owner/tree.jpg', (0.03, 0.02, 0.97, 0.98)),
    'amitabha': ('amitabha-1.jpg', (0.03, 0.02, 0.97, 0.97)),
    'jigten-sumgon': ('commons/jigten-sumgon-1.jpg', (0, 0, 1, 1)),
    'four-armed-chenrezig': ('../chenrezig-thangka.png', (0.015, 0.0, 0.975, 0.975)),
    'green-tara': ('web/green-tara-1.jpg', (0, 0, 1, 1)),
    'vajrakilaya': ('commons/vajrakilaya-1.jpg', (0.155, 0.095, 0.845, 0.905)),
    'samantabhadra': ('garchen/samantabhadra-1.png', (0, 0, 1, 1)),
    'gampopa': ('web/gampopa-4.jpg', (0, 0, 1, 1)),
    'shakyamuni': ('garchen/shakyamuni-2.png', (0.035, 0.025, 0.965, 0.975)),
    'milarepa': ('commons/milarepa-1.jpg', (0, 0, 1, 1)),
    'guru-rinpoche': ('garchen/guru-rinpoche.png', (0, 0, 1, 1)),
    'wheel-of-life': ('commons/wheel-of-life-3.jpg', (0.12, 0.10, 0.88, 0.92)),
    'vajrasattva': ('garchen/vajrasattva.jpg', (0.035, 0.03, 0.965, 0.97)),
    'white-tara': ('garchen/white-tara.png', (0, 0, 1, 1)),
}

# Each wall, left to right as the texture runs: pictures with their frame design, and openings.
# A run of pictures between openings is spaced evenly over the free stretch it has.
WALLS = {
    'north': [('thousand-armed-chenrezig', 'a'), ('refuge-tree', 'b'), ('amitabha', 'b'), ('jigten-sumgon', 'a')],
    'east': [('four-armed-chenrezig', 'b'), WINDOW, ('green-tara', 'a'), ('vajrakilaya', 'c')],
    'south': [('samantabhadra', 'c'), ('gampopa', 'a'), ('shakyamuni', 'b'), ('milarepa', 'a'), ('guru-rinpoche', 'c')],
    'west': [('wheel-of-life', 'c'), ('vajrasattva', 'a'), DOOR, ('white-tara', 'a')],
}


def frame(design):
    """The frame cut out by Codex, and its opening as (left, top, right, bottom) in its pixels,
    found by walking out from the middle until the frame begins."""
    im = Image.open(FRAMES / f'frame-{design}-cut.png').convert('RGBA')
    a = np.asarray(im)[..., 3]
    h, w = a.shape
    cy, cx = h // 2, w // 2
    l = cx - int(np.argmax(a[cy, cx::-1] > 128))
    r = cx + int(np.argmax(a[cy, cx:] > 128))
    t = cy - int(np.argmax(a[cy::-1, cx] > 128))
    b = cy + int(np.argmax(a[cy:, cx] > 128))
    return im, (l, t, r, b)


def picture(name, w, h):
    """The picture cropped to fill a w x h opening: its own crop, then trimmed evenly to the
    opening's shape (the trim takes background at the painting's edges, never its figures)."""
    rel, (l, t, r, b) = PICTURES[name]
    im = Image.open(REF / rel).convert('RGB')
    W, H = im.size
    im = im.crop((round(l * W), round(t * H), round(r * W), round(b * H)))
    W, H = im.size
    if W / H > w / h:
        cw = round(H * w / h)
        im = im.crop(((W - cw) // 2, 0, (W - cw) // 2 + cw, H))
    else:
        ch = round(W * h / w)
        im = im.crop((0, (H - ch) // 2, W, (H - ch) // 2 + ch))
    return im.resize((w, h), Image.LANCZOS)


def tone(rgb):
    """Bring a bright printed thangka into the mural's light: a little less saturated,
    warmer and darker, the way mineral pigment under soot and lamp light reads. Only the
    colour changes; no line or shape."""
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    rgb = lum[..., None] + (rgb - lum[..., None]) * 0.88
    return rgb * np.array([1.0, 0.95, 0.85], np.float32) * 0.86


def centres(items):
    """Where each picture's middle falls: each run of pictures between the wall's ends and its
    openings shares out its stretch evenly."""
    out, start, run = {}, 0, []
    for it in items + [(OUT_W, OUT_W)]:
        if isinstance(it[0], int):
            for k, p in enumerate(run):
                out[p[0]] = start + (it[0] - start) * (k + 0.5) / len(run)
            start, run = it[1], []
        else:
            run.append(it)
    return out


SURROUND = 90  # the window's and door's carved surround, px wide on every side (0.35 m)


def surround(opening):
    """An even carved surround for an opening (left, top, right, bottom, in wall px; the door's
    reaches the floor, so it has no foot): frame B's side moulding run round all sides, mitred at
    the corners, starting exactly at the opening's edge. RGBA, with its offset on the wall."""
    im = Image.open(FRAMES / 'frame-b-cut.png').convert('RGBA')
    l, t, r, b = frame('b')[1]
    side = np.asarray(im.crop((0, t + 150, l, b - 150)), np.float32)  # the left moulding, outer edge at x 0
    side = side[:, np.argmax(side[side.shape[0] // 2, :, 3] > 128):]   # from where the carving starts
    ol, ot, orr, ob = opening
    B = SURROUND
    W, H = orr - ol + 1 + 2 * B, ob - ot + 1 + B + (B if ob < OUT_H - 1 else 0)
    y, x = np.mgrid[0:H, 0:W]
    d = np.stack([x, W - 1 - x, y, H - 1 - y if ob < OUT_H - 1 else np.full_like(y, 10 ** 6)])
    which = d.argmin(0)
    depth = d.min(0)                                                  # px in from the outer edge
    along = np.choose(which, [y, y, x, x])
    length = np.choose(which, [H, H, W, W])
    sh, sw = side.shape[:2]
    u = np.clip(depth * sw / B, 0, sw - 1).astype(int)
    v = (along * sh / np.maximum(length, 1)).astype(int) % sh
    out = side[v, u]
    out[depth >= B] = 0                                               # the opening itself
    return Image.fromarray(out.astype(np.uint8), 'RGBA'), (ol - B, ot - B)


def compose(name):
    base = Image.open(ROOT / 'concept-art' / 'walls' / f'wall-{name}-lotus.png').convert('RGB')
    base = base.resize((OUT_W, OUT_H), Image.LANCZOS)
    wall = base.convert('RGBA')
    shadow = Image.new('L', (OUT_W, OUT_H), 0)
    hung = []
    xs = centres(WALLS[name])
    for item in WALLS[name]:
        if isinstance(item[0], int):
            continue
        pic, design = item
        im, (l, t, r, b) = frame(design)
        s = FRAME_H / im.height
        fim = im.resize((round(im.width * s), FRAME_H), Image.LANCZOS)
        x0, y0 = round(xs[pic] - fim.width / 2), ROW_MID - FRAME_H // 2
        ow, oh = round((r - l) * s) + 4, round((b - t) * s) + 4  # a little under the moulding
        ox, oy = x0 + round(l * s) - 2, y0 + round(t * s) - 2
        rgb = tone(np.asarray(picture(pic, ow, oh), np.float32) / 255)
        wall.paste(Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8)).convert('RGBA'), (ox, oy))
        shadow.paste(fim.getchannel('A'), (x0 + 4, y0 + 9))
        hung.append((fim, x0, y0))
        a = np.asarray(fim.getchannel('A')) > 128  # the frame's own extent, its crest included
        ys_, xs_ = np.where(a)
        BOXES.append([name, (x0 + xs_.min()) / OUT_W * 8, (x0 + xs_.max() + 1) / OUT_W * 8,
                      4.75 * (1 - (y0 + ys_.max() + 1) / OUT_H), 4.75 * (1 - (y0 + ys_.min()) / OUT_H)])
    # the frames stand a little off the wall: a soft shadow below and right of each
    dark = Image.new('RGBA', (OUT_W, OUT_H), (12, 8, 5, 255))
    wall = Image.composite(dark, wall, shadow.filter(ImageFilter.GaussianBlur(7)).point(lambda v: int(v * 0.55)))
    for fim, x0, y0 in hung:
        wall.alpha_composite(fim, (x0, y0))
    black = np.asarray(base).max(axis=2) < 5
    if black.any():  # the opening: the rows and columns mostly black (a stray dark speck elsewhere is not it)
        rs, cs = black.sum(1), black.sum(0)
        ys, xs = np.where(rs > rs.max() * 0.5)[0], np.where(cs > cs.max() * 0.5)[0]
        sim, (sx, sy) = surround((xs.min(), ys.min(), xs.max(), ys.max()))
        wall.alpha_composite(sim, (sx, sy))
    out = np.asarray(wall.convert('RGB')).astype(np.int32)
    # build.mjs finds the window and door as the wall's near-black pixels, so nothing else may be that dark (a dark
    # thangka beside the door made the door stand 3 m tall): every other pixel is lifted to at least grey 16
    g = (out * [77, 150, 29]).sum(2) >> 8
    out = np.where((g < 16)[..., None], out + (16 - g)[..., None], out)
    out[np.asarray(base).max(axis=2) < 5] = 0  # the window and door stay pure black
    out = np.clip(out, 0, 255).astype(np.uint8)
    dst = ROOT / 'concept-art' / 'textures' / f'wall-{name}.png'
    Image.fromarray(out).save(dst)
    print(dst)


BOXES = []  # each frame as [wall, u0, u1, y0, y1]: metres along the wall as its texture runs, and up from the floor

if __name__ == '__main__':
    for n in sys.argv[1:] or list(WALLS):
        compose(n)
    if not sys.argv[1:]:  # the frames stand 4 cm off the wall as real boxes (scene.js reads frames.js)
        W = {'north': 0, 'east': 1, 'south': 2, 'west': 3}
        rows = ',\n'.join(f'  [{W[b[0]]}, {b[1]:.4f}, {b[2]:.4f}, {b[3]:.4f}, {b[4]:.4f}]' for b in BOXES)
        (ROOT / 'source' / 'src' / 'frames.js').write_text(
            '// Made by walls.py: each framed thangka as [wall (0 north, 1 east, 2 south, 3 west), u0, u1, y0, y1], metres\n'
            '// along the wall as its texture runs and up from the floor. scene.js stands each as a box FRAME_D off the wall.\n'
            f'const FRAMES = [\n{rows},\n];\n', encoding='utf-8')
