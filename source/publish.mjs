// Copies what the browser needs (and the share image) into ../site (the clone of ryanallen/chenrezig, served by GitHub Pages at
// ryanallen.com/chenrezig) and pushes it: index.html, tex/, the web copies of the audio, and the source (this folder without
// node_modules) so the code can be read. Run after build.mjs.
// node publish.mjs ["commit message"]
import { cpSync, rmSync, mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..'), site = path.join(root, 'site');
if (!existsSync(path.join(site, '.git'))) throw new Error('No clone at ../site: git clone https://github.com/ryanallen/chenrezig.git site');
const git = (...a) => execFileSync('git', ['-C', site, ...a], { encoding: 'utf8' }).trim();
if (!/ryanallen\/chenrezig(\.git)?$/.test(git('remote', 'get-url', 'origin'))) throw new Error('../site is not the chenrezig clone');

for (const f of readdirSync(site)) if (f !== '.git') rmSync(path.join(site, f), { recursive: true, force: true });
cpSync(path.join(root, 'index.html'), path.join(site, 'index.html'));
cpSync(path.join(root, 'share.jpg'), path.join(site, 'share.jpg')); // the social share image (share.mjs)
cpSync(path.join(root, 'tex'), path.join(site, 'tex'), { recursive: true });
mkdirSync(path.join(site, 'audio', 'web'), { recursive: true });
for (const f of readdirSync(path.join(root, 'audio', 'web'))) cpSync(path.join(root, 'audio', 'web', f), path.join(site, 'audio', 'web', f));
cpSync(here, path.join(site, 'source'), { recursive: true, filter: (f) => !/[\\/]node_modules([\\/]|$)/.test(f) });
writeFileSync(path.join(site, '.nojekyll'), '');
writeFileSync(path.join(site, 'README.md'), `# Chenrezig

A Tibetan mani wheel temple for H.E. Garchen Rinpoche's Chenrezig empowerment, given online on 23 May 2020 through the Garchen Buddhist Institute. Turn the great prayer wheel, read the teaching from a pecha, and watch the empowerment on a phone beside it.

Open it at https://ryanallen.com/chenrezig/

The page is one HTML file, about 68 KB with the teaching in it: no framework and no 3D library, a WebGL2 fragment shader that ray traces the room every frame. Its images and 3D models stream in after it opens.

- \`index.html\`: the built page, the code and the teaching
- \`tex/\`: the images and models, each as a quick copy and at full size, streamed in after the page opens
- \`audio/web/\`: the background audio, Opus and AAC
- \`source/\`: the source. \`src/\` holds the shader and page modules (\`scene.js\` the room as distance fields and its materials, \`frame.js\` the per-pixel trace with the clouds, fog, smoke and rain, \`bake.js\` the bounced light gathered at load, \`main.js\` WebGL setup, loading, controls and the frame loop, \`read.js\` the pecha, phone and start page, \`tex.js\` the drum's texture); \`build.mjs\` writes \`index.html\` and \`tex/\`; \`blender/models.py\` makes the statue and offering models in Blender; \`walls.py\` hangs the thangkas on the walls; \`shot.mjs\` renders and times the page in headless Edge. The source images are not included.

Build: \`cd source && npm install && node build.mjs\`

The thangkas on the walls are real paintings (from garchen.net, Wikimedia Commons and others); the room's own textures, the statue and the offerings were painted by an image model.

Support the Garchen Buddhist Institute: https://garchen.net/donations-x/
`);
git('add', '-A');
if (git('status', '--porcelain')) {
  git('commit', '-m', process.argv[2] || 'Publish the temple');
  git('push', '-u', 'origin', 'HEAD:main');
  console.log('pushed', git('rev-parse', '--short', 'HEAD'));
} else console.log('nothing changed');
