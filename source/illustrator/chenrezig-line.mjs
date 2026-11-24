// The line drawing of Four-Armed Chenrezig as vector paths. Codex drew the thangka the statue is made from
// (../../chenrezig-thangka.png) as clean ink line art (../../concept-art/line/chenrezig-lineart.png); this doubles it so
// curves trace smooth and has Illustrator's Image Trace turn it into paths through the illustrator skill, saved in
// ../../concept-art/line/ as chenrezig-line.ai, .svg and -preview.png.
// node chenrezig-line.mjs   (Illustrator open)
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)), root = path.join(here, '..', '..');
const ffmpeg = (await import('ffmpeg-static')).default;
const out = path.join(root, 'concept-art', 'line'), big = path.join(os.tmpdir(), 'chenrezig-lineart-2x.png');
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(out, 'chenrezig-lineart.png'), '-vf', 'scale=iw*2:ih*2:flags=lanczos,format=gray', big]);
const ai = path.join(root, '..', '..', '.agents', 'skills', 'illustrator', 'ai.mjs');
console.log(execFileSync('node', [ai, 'trace', big, path.join(out, 'chenrezig-line'), '--threshold', '160', '--fidelity', '90', '--noise', '6', '--corner', '80'], { encoding: 'utf8' }).trim());
