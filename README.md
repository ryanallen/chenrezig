# Chenrezig

A Tibetan mani wheel temple for H.E. Garchen Rinpoche's Chenrezig empowerment, given online on 23 May 2020 through the Garchen Buddhist Institute. Turn the great prayer wheel, read the teaching from a pecha, and watch the empowerment on a phone beside it.

Open it at https://ryanallen.com/chenrezig/

The page is one HTML file, about 68 KB with the teaching in it: no framework and no 3D library, a WebGL2 fragment shader that ray traces the room every frame. Its images and 3D models stream in after it opens.

- `index.html`: the built page, the code and the teaching
- `tex/`: the images and models, each as a quick copy and at full size, streamed in after the page opens
- `audio/web/`: the background audio, Opus and AAC
- `source/`: the source. `src/` holds the shader and page modules (`scene.js` the room as distance fields and its materials, `frame.js` the per-pixel trace with the clouds, fog, smoke and rain, `bake.js` the bounced light gathered at load, `main.js` WebGL setup, loading, controls and the frame loop, `read.js` the pecha, phone and start page, `tex.js` the drum's texture); `build.mjs` writes `index.html` and `tex/`; `blender/models.py` makes the statue and offering models in Blender; `walls.py` hangs the thangkas on the walls; `shot.mjs` renders and times the page in headless Edge. The source images are not included.

Build: `cd source && npm install && node build.mjs`

The thangkas on the walls are real paintings (from garchen.net, Wikimedia Commons and others); the room's own textures, the statue and the offerings were painted by an image model.

Support the Garchen Buddhist Institute: https://garchen.net/donations-x/
