// Fetches reference images of each deity on the walls from Wikimedia Commons (thangkas and murals, with their
// licences) into ../references/, and writes ../references/SOURCES.md listing where each came from.
// node refs.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'references');
mkdirSync(out, { recursive: true });
const UA = { 'User-Agent': 'mani-temple-reference-fetch/1.0 (personal art reference)' };
const API = 'https://commons.wikimedia.org/w/api.php';
const WANT = [
  ['thousand-armed-chenrezig', 'thousand-armed Avalokiteshvara'],
  ['four-armed-chenrezig', 'Shadakshari'],
  ['green-tara', 'Green Tara thangka'],
  ['padmasambhava', 'Padmasambhava thangka'],
  ['amitabha', 'Amitabha thangka'],
  ['medicine-buddha', 'Medicine Buddha thangka'],
  ['white-tara', 'White Tara thangka'],
  ['manjushri', 'Manjushri thangka'],
  ['dhritarashtra', 'Dhritarashtra'],
  ['virudhaka', 'Virudhaka'],
  ['virupaksha', 'Virupaksha'],
  ['vaishravana', 'Vaishravana thangka'],
  ['wheel-of-life', 'Bhavachakra'],
  ['four-kings-mural', 'four guardian kings mural'],
];
const lines = ['# Reference images', '', 'Downloaded from Wikimedia Commons by `source/refs.mjs`, for Codex to work the wall textures from.', '', '| File | Subject | Source | Author | Licence |', '|---|---|---|---|---|'];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(u) { for (let i = 0; i < 5; i++) { const t = await (await fetch(u, { headers: UA })).text(); try { return JSON.parse(t); } catch { await pause(8000 * (i + 1)); } } return {}; }
for (const [name, q] of WANT) {
  await pause(2500);
  const u = `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(q)}&prop=imageinfo&iiprop=url|size|extmetadata|mime&iiurlwidth=2000`;
  const r = await json(u);
  const pages = Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index)
    .filter((p) => p.imageinfo?.[0]?.mime?.startsWith('image/jp') || p.imageinfo?.[0]?.mime === 'image/png')
    .filter((p) => (p.imageinfo[0].width || 0) >= 700);
  let n = 0;
  for (const p of pages.slice(0, 3)) {
    const ii = p.imageinfo[0], md = ii.extmetadata || {};
    const ext = ii.mime === 'image/png' ? 'png' : 'jpg';
    const file = `${name}-${++n}.${ext}`;
    await pause(1500);
    const img = await fetch(ii.thumburl || ii.url, { headers: UA });
    if (!img.ok) { n--; continue; }
    writeFileSync(path.join(out, file), Buffer.from(await img.arrayBuffer()));
    const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\|/g, '/').trim().slice(0, 80);
    lines.push(`| ${file} | ${p.title.replace(/^File:/, '').replace(/\|/g, '/')} | ${ii.descriptionurl} | ${strip(md.Artist?.value)} | ${strip(md.LicenseShortName?.value)} |`);
  }
  console.log(name, n);
}
writeFileSync(path.join(out, 'SOURCES.md'), lines.join('\n') + '\n');
