"""Pack Codex's offerings (concept-art/offerings/<name>.png, each on flat #00FF00) into one atlas
four cells across, concept-art/textures/offerings.png, 2048 px wide, in the order frame.js's OFF list
reads them. The page keys the green out when it loads the atlas. Their depth maps
(<name>-depth.png, white nearest) go into concept-art/textures/offerings-depth.png the same way, and their paintings from
above (<name>-top.png, the front at the bottom) into offerings-top.png.

    python source/offerings.py
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ORDER = ['incense-burner', 'flowers', 'mandala', 'fruit', 'khapse', 'torma', 'conch', 'mirror',
         'silks', 'bell-dorje', 'damaru', 'cymbals', 'nga-drum', 'saffron-water', 'grain', 'mani-pills',
         'jewel-bowl', 'norbu', 'treasure-vase', 'gold-silver', 'coral-turquoise', 'crystal']
CELL = 512

ROWS = (len(ORDER) + 3) // 4
for suffix, mode, bg in [('', 'RGB', (0, 255, 0)), ('-depth', 'L', 0), ('-top', 'RGB', (0, 255, 0))]:
    if not all((ROOT / 'concept-art' / 'offerings' / f'{n}{suffix}.png').exists() for n in ORDER):
        continue
    atlas = Image.new(mode, (CELL * 4, CELL * ROWS), bg)
    for i, name in enumerate(ORDER):
        im = Image.open(ROOT / 'concept-art' / 'offerings' / f'{name}{suffix}.png').convert(mode).resize((CELL, CELL), Image.LANCZOS)
        atlas.paste(im, ((i % 4) * CELL, (i // 4) * CELL))
    dst = ROOT / 'concept-art' / 'textures' / f'offerings{suffix}.png'
    atlas.save(dst)
    print(dst)
