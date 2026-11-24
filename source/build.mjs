// Bundles src/*.js and the textures into the single self-contained ../index.html.
// Audio in ../audio/ is listed in the page; each track also gets a compressed copy (Opus in WebM, 64 kbps)
// in ../audio/web/, made with ffmpeg, which the page plays first. The originals stay for local listening.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { gzipSync, deflateRawSync } from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const FILES = ['layout.js', 'frames.js', 'tex.js', 'scene.js', 'bake.js', 'frame.js', 'read.js', 'main.js'];
const readable = process.argv.includes('--readable');

// ---- audio ----
const TYPES = { '.webm': 'audio/webm; codecs=opus', '.ogg': 'audio/ogg', '.opus': 'audio/ogg; codecs=opus', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac' };
const adir = path.join(here, '..', 'audio'), wdir = path.join(adir, 'web');
const audio = [];
if (existsSync(adir)) {
  let ffmpeg = null;
  try { ffmpeg = (await import('ffmpeg-static')).default; } catch {}
  for (const f of readdirSync(adir).sort()) {
    const ext = path.extname(f).toLowerCase(); if (!TYPES[ext] || !statSync(path.join(adir, f)).isFile()) continue;
    const base = path.basename(f, ext), web = path.join(wdir, base + '.webm');
    if (ffmpeg && (!existsSync(web) || statSync(web).mtimeMs < statSync(path.join(adir, f)).mtimeMs)) {
      mkdirSync(wdir, { recursive: true });
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(adir, f), '-vn', '-c:a', 'libopus', '-b:a', '64k', web]);
    }
    if (existsSync(web)) audio.push({ src: 'audio/web/' + base + '.webm', type: TYPES['.webm'] });
    // AAC for iPhones before iOS 17, which play no Opus
    const m4a = path.join(wdir, base + '.m4a');
    if (ffmpeg && (!existsSync(m4a) || statSync(m4a).mtimeMs < statSync(path.join(adir, f)).mtimeMs)) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(adir, f), '-vn', '-c:a', 'aac', '-b:a', '80k', '-movflags', '+faststart', m4a]);
    if (existsSync(m4a)) audio.push({ src: 'audio/web/' + base + '.m4a', type: TYPES['.m4a'] });
    audio.push({ src: 'audio/' + f, type: TYPES[ext] });
  }
}

// ---- the teaching, for the pecha: ../../chenrezig-empowerment-2020/chenrezig-empowerment.md in sections of blocks ----
// Each section is { part, title, blocks: [{ k: 'p' | 'q' | 'li' | 'ol' | 'mantra', h: html }] }; the head gives the title leaf.
const VIDEOS = {};
const TEACHING = (() => {
  const md = readFileSync(path.join(here, '..', '..', 'chenrezig-empowerment-2020', 'chenrezig-empowerment.md'), 'utf8').replace(/\r/g, '');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const head = { title: '', byline: '' }, sections = [];
  let part = '', sec = null, para = [], kind = 'p';
  const flush = () => { if (para.length && sec) sec.blocks.push({ k: kind, h: inline(para.join(' ')) }); para = []; kind = 'p'; };
  for (const line of md.split('\n')) {
    let m;
    if ((m = line.match(/^# (.+)/))) { head.title = m[1]; continue; }
    if ((m = line.match(/^- Part (\d): <https:\/\/www\.youtube\.com\/watch\?v=([\w-]+)>/))) { VIDEOS[m[1]] = m[2]; continue; }
    if ((m = line.match(/^## (.+)/))) { flush(); part = m[1]; continue; }
    if ((m = line.match(/^### (.+)/))) { flush(); sec = { part, title: m[1], blocks: [] }; sections.push(sec); continue; }
    if (!sec) { if (/^H\.E\./.test(line)) head.byline = line.split('. This is')[0] + '.'; continue; }
    if (/^!\[Om Mani Padme Hum\]/.test(line)) { flush(); sec.blocks.push({ k: 'mantra', h: 'ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ' }); continue; }
    if (/^(!\[|\{\[|---)/.test(line)) { flush(); continue; }
    if (!line.trim() || line.trim() === '>') { flush(); continue; }
    if ((m = line.match(/^> ?(.*)/))) { if (kind !== 'q') flush(); kind = 'q'; para.push(m[1]); continue; }
    if ((m = line.match(/^- (.*)/))) { flush(); kind = 'li'; para.push(m[1]); continue; }
    if ((m = line.match(/^(\d+)\. (.*)/))) { flush(); kind = 'ol'; para.push(m[1] + '. ' + m[2]); continue; }
    para.push(line.trim());
  }
  flush();
  return { head, sections };
})();
console.log('teaching: ' + TEACHING.sections.length + ' sections, videos ' + JSON.stringify(VIDEOS));

// ---- the textures in ../concept-art/textures, embedded as WebP data URLs (a WebGL texture cannot be read from a
// file:// image, so embedding is what lets the page open straight from disk) ----
let texTag = '';
{
  const ffmpeg = (await import('ffmpeg-static')).default;
  const tdir = path.join(here, '..', 'concept-art', 'textures');
  const MAX = { 'wall-north': 2048, 'wall-east': 2048, 'wall-south': 2048, 'wall-west': 2048, statue: 1536, offerings: 2048, 'offerings-depth': 2048, 'offerings-top': 2048, 'statue-depth': 1536, 'window-view': 1600 };
  const out = {};
  for (const f of existsSync(tdir) ? readdirSync(tdir).sort() : []) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    const name = f.replace(/\.[^.]+$/, ''), m = MAX[name] || 1024, jpg = path.join(os.tmpdir(), 'mani-' + name + '.webp');
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(tdir, f), '-vf', `scale='min(${m},iw)':-2`, '-c:v', 'libwebp', '-compression_level', '6', ...(name.endsWith('-depth') ? ['-lossless', '1'] : ['-quality', name.startsWith('statue') ? '88' : name.startsWith('wall') ? '82' : '78']), jpg]); // the depth lossless: lossy blocks show as bumps; level 6 is libwebp's slowest and tightest, at the same quality
    out[name] = 'data:image/webp;base64,' + readFileSync(jpg).toString('base64');
  }
  // the window and door openings, where each wall texture paints them pure black: [left, right, bottom, top] in metres
  const opening = (name, wallW, wallH) => {
    const f = path.join(tdir, name + '.png'); if (!existsSync(f)) return null;
    const W = 400, H = 238;
    const px = execFileSync(ffmpeg, ['-loglevel', 'error', '-i', f, '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
    const dark = (x, y) => px[y * W + x] < 12;
    const cols = [], rows = [];
    for (let x = 0; x < W; x++) { let n = 0; for (let y = 0; y < H; y++) n += dark(x, y); if (n > H * 0.15) cols.push(x); }
    for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) n += dark(x, y); if (n > W * 0.06) rows.push(y); }
    if (!cols.length || !rows.length) return null;
    return [cols[0] / W * wallW, (cols.at(-1) + 1) / W * wallW, (1 - (rows.at(-1) + 1) / H) * wallH, (1 - rows[0] / H) * wallH];
  };
  const w = opening('wall-east', 8, 4.75), d = opening('wall-west', 8, 4.75);
  // east wall: u runs from z = -4; west wall: u runs from z = +4 down
  const win = w ? [-4 + (w[0] + w[1]) / 2, (w[2] + w[3]) / 2, (w[3] - w[2]) / 2, (w[1] - w[0]) / 2] : [-1.2, 2.95, 0.7, 0.6];
  const door = d ? [4 - (d[0] + d[1]) / 2, Math.min(d[3], 3), (d[1] - d[0]) / 2] : [-1.4, 2.2, 0.55];
  // the pecha, its table and cushion, in ../concept-art/pecha
  const pdir = path.join(here, '..', 'concept-art', 'pecha');
  for (const f of existsSync(pdir) ? readdirSync(pdir).sort() : []) {
    if (!/\.(png|jpe?g)$/i.test(f)) continue;
    const name = 'pecha-' + f.replace(/\.[^.]+$/, ''), m = /leaf/.test(name) ? 2048 : /miniature/.test(name) ? 768 : 1024, tmp = path.join(os.tmpdir(), 'mani-' + name + '.webp');
    if (name === 'pecha-leaf') {
      // the scan's white background shows at the leaf's worn corners: flood it from each corner into transparency
      const W = 2048, H = Math.round(2048 * 724 / 2172);
      const px = Buffer.from(execFileSync(ffmpeg, ['-loglevel', 'error', '-i', path.join(pdir, f), '-vf', `scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 26 }));
      const bg = (i) => Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) > 196 && Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) - Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < 40;
      const seen = new Uint8Array(W * H), stack = [0, W - 1, (H - 1) * W, H * W - 1];
      while (stack.length) {
        const i = stack.pop(); if (seen[i] || !bg(i)) continue;
        seen[i] = 1; px[i * 4 + 3] = 0;
        const x = i % W, y = (i / W) | 0;
        if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
      }
      // soften the cut edge by a pixel
      for (let i = 0; i < W * H; i++) if (!seen[i] && px[i * 4 + 3] && ((i % W && seen[i - 1]) || (i % W < W - 1 && seen[i + 1]) || seen[i - W] || seen[i + W])) px[i * 4 + 3] = 140;
      const raw = path.join(os.tmpdir(), 'mani-leaf.rgba'); writeFileSync(raw, px);
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', raw, '-c:v', 'libwebp', '-quality', '86', '-pix_fmt', 'yuva420p', tmp]);
    } else execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', path.join(pdir, f), '-vf', `scale='min(${m},iw)':-2`, '-c:v', 'libwebp', '-quality', /miniature/.test(name) ? '86' : '78', tmp]);
    out[name] = 'data:image/webp;base64,' + readFileSync(tmp).toString('base64');
  }
  // the two videos' thumbnails from YouTube, kept in the temp folder once fetched
  for (const [k, id] of Object.entries(VIDEOS)) {
    const tmp = path.join(os.tmpdir(), 'mani-thumb16-' + id + '.jpg');
    if (!existsSync(tmp)) {
      for (const q of ['maxresdefault', 'mqdefault']) { try { const r = await fetch(`https://i.ytimg.com/vi/${id}/${q}.jpg`); if (r.ok) { writeFileSync(tmp, Buffer.from(await r.arrayBuffer())); break; } } catch {} }
    }
    if (existsSync(tmp)) out['thumb-' + k] = 'data:image/jpeg;base64,' + readFileSync(tmp).toString('base64');
  }
  // Each image goes to ../tex/<name>.js as one call, MANI_TEX(name, dataURL): the page loads these as scripts after it
  // opens (a script loads from disk where an image file cannot reach WebGL), first what the visitor sees first.
  const LABELS = {
    'wall-north': 'North wall: Thousand-Armed Chenrezig, the refuge tree, Amitabha, Lord Jigten Sumgon', 'offerings': 'The offerings', 'offerings-depth': 'The offerings’ depth', 'offerings-top': 'The offerings from above', 'models': 'The statue and offerings in 3D', 'statue': 'The statue of Chenrezig', 'statue-depth': 'The statue’s depth',
    'wall-east': 'East wall: Four-Armed Chenrezig, Green Tara, Vajrakilaya', 'wall-west': 'West wall: the Wheel of Life, Vajrasattva, White Tara',
    'wall-south': 'South wall: Samantabhadra, Gampopa, Shakyamuni, Milarepa, Guru Rinpoche', 'floor-planks': 'The floor', 'pillar-wood': 'The pillars',
    'pillar-brocade': 'The pillar brocades', 'capital': 'The capitals', 'beam': 'The beams', 'ceiling': 'The ceiling', 'altar-front': 'The altar',
    'banner-silk': 'The banners and canopy', 'window-view': 'The view from the window', 'whitewash': 'The window reveal', 'door': 'The door',
    'pecha-choktse-top': 'The low table', 'pecha-choktse-front': 'The low table’s front', 'pecha-cushion': 'The cushion', 'pecha-cover-board': 'The pecha’s cover boards',
    'pecha-silk': 'The pecha’s silk wrapper', 'thumb-1': 'The phone’s screen, Part 1', 'pecha-leaf': 'The pecha’s leaves',
    'pecha-miniature-chenrezig': 'The pecha’s miniature of Chenrezig', 'pecha-miniature-amitabha': 'The pecha’s miniature of Amitabha', 'thumb-2': 'Part 2’s picture',
  };
  // The models (../concept-art/models/<name>.glb, made in Blender by blender/models.py), placed in the room as layout.js
  // says and packed for the page as one stream, models.js: a header of Uint32s [count, then per model its texture
  // (0 the statue, 1 the offerings' atlas), vertex count, index count], then per model its vertices (20 bytes, stored as
  // byte runs of differences, below:
  // position as Int16 x3 in eighths of a millimetre from the room's corner plus padding, normal as Int8 x4, texture
  // coordinates as Uint16 x2 already in the atlas, and its coordinates in the view from above, from its own x and z) and its Uint16 indices, each model padded to 4 bytes.
  const mdir = path.join(here, '..', 'concept-art', 'models');
  if (existsSync(path.join(mdir, 'statue.glb'))) {
    const L = new Function(readFileSync(path.join(here, 'src', 'layout.js'), 'utf8') + ';return { OFFERINGS, OFFER_TURN, STATUE_AT };')();
    const glb = (f) => {
      const buf = readFileSync(f), jl = buf.readUInt32LE(12), json = JSON.parse(buf.subarray(20, 20 + jl).toString());
      const bin = buf.subarray(20 + jl + 8), pr = json.meshes[0].primitives[0];
      const acc = (i) => { const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type] * a.count;
        const off = (v.byteOffset || 0) + (a.byteOffset || 0);
        return a.componentType === 5126 ? new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 4))
          : a.componentType === 5125 ? new Uint32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 4))
          : new Uint16Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + n * 2)); };
      return { p: acc(pr.attributes.POSITION), n: acc(pr.attributes.NORMAL), t: acc(pr.attributes.TEXCOORD_0), i: acc(pr.indices) };
    };
    const list = [['statue', 0, ...L.STATUE_AT, 0, 0, 0], ...L.OFFERINGS.map(([name, x, y, z, s], k) => [name, 1, x, y, z, s, L.OFFER_TURN, k])];
    const heads = [list.length], parts = [];
    for (const [name, tex, x, y, z, s, turn, cell] of list) {
      const m = glb(path.join(mdir, name + '.glb')), nv = m.p.length / 3, a = turn * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      const vb = Buffer.alloc(nv * 20);
      for (let v = 0; v < nv; v++) {
        const px = m.p[v * 3], py = m.p[v * 3 + 1], pz = m.p[v * 3 + 2], nx = m.n[v * 3], ny = m.n[v * 3 + 1], nz = m.n[v * 3 + 2];
        const wx = x + s * (px * ca + pz * sa), wy = y + s * py, wz = z + s * (-px * sa + pz * ca);
        vb.writeInt16LE(Math.round((wx + 4) * 8000 - 32768), v * 20); vb.writeInt16LE(Math.round(wy * 8000 - 32768), v * 20 + 2); vb.writeInt16LE(Math.round((wz + 4) * 8000 - 32768), v * 20 + 4);
        vb.writeInt8(Math.round((nx * ca + nz * sa) * 127), v * 20 + 8); vb.writeInt8(Math.round(ny * 127), v * 20 + 9); vb.writeInt8(Math.round((-nx * sa + nz * ca) * 127), v * 20 + 10);
        let u = m.t[v * 2], w = m.t[v * 2 + 1];
        if (tex) { u = ((cell % 4) + u) / 4; w = (Math.floor(cell / 4) + w) / 6; }
        vb.writeUInt16LE(Math.round(Math.min(1, Math.max(0, u)) * 65535), v * 20 + 12); vb.writeUInt16LE(Math.round(Math.min(1, Math.max(0, w)) * 65535), v * 20 + 14);
        let tu = 0.5 + px, tw = 0.5 + pz; // the view from above: centred, the front at the bottom
        if (tex) { tu = ((cell % 4) + Math.min(1, Math.max(0, tu))) / 4; tw = (Math.floor(cell / 4) + Math.min(1, Math.max(0, tw))) / 6; }
        vb.writeUInt16LE(Math.round(Math.min(1, Math.max(0, tu)) * 65535), v * 20 + 16); vb.writeUInt16LE(Math.round(Math.min(1, Math.max(0, tw)) * 65535), v * 20 + 18);
      }
      const ib = Buffer.alloc(Math.ceil(m.i.length * 2 / 4) * 4);
      m.i.forEach((k, j) => ib.writeUInt16LE(k, j * 2));
      // stored so the web's compression can shrink it (the page undoes this, losing nothing): each of the vertex's
      // ten 16-bit fields as the difference from the vertex before, low bytes and high bytes each in a run of their own;
      // the indices the same way
      const cols = Buffer.alloc(nv * 20);
      for (let f = 0; f < 10; f++) { let prev = 0; for (let v = 0; v < nv; v++) { const x = vb.readUInt16LE(v * 20 + f * 2), d = (x - prev) & 0xffff; prev = x; cols[f * 2 * nv + v] = d & 255; cols[(f * 2 + 1) * nv + v] = d >> 8; } }
      const ni = m.i.length, ic = Buffer.alloc(Math.ceil(ni * 2 / 4) * 4);
      { let prev = 0; for (let k = 0; k < ni; k++) { const x = m.i[k], d = (x - prev) & 0xffff; prev = x; ic[k] = d & 255; ic[ni + k] = d >> 8; } }
      heads.push(tex, nv, ni); parts.push(cols, ic);
    }
    const head = Buffer.alloc(heads.length * 4); heads.forEach((h, j) => head.writeUInt32LE(h, j * 4));
    out['models'] = 'data:application/octet-stream;base64,' + Buffer.concat([head, ...parts]).toString('base64');
  }
  const order = Object.keys(LABELS).filter((n) => out[n]).concat(Object.keys(out).filter((n) => !LABELS[n]));
  const tdirOut = path.join(here, '..', 'tex');
  mkdirSync(tdirOut, { recursive: true });
  for (const f of readdirSync(tdirOut)) if (!out[f.replace(/(\.lo)?\.js$/, '')]) unlinkSync(path.join(tdirOut, f));
  // and a quick copy, <name>.lo.js, at most 512 px across, which the page loads for every image before any full one
  const assets = order.map((n) => {
    const body = `MANI_TEX(${JSON.stringify(n)},${JSON.stringify(out[n])})`;
    writeFileSync(path.join(tdirOut, n + '.js'), body);
    let lo = 0;
    if (!n.startsWith('thumb') && n !== 'models') {
      const src = path.join(os.tmpdir(), 'mani-src-' + n), small = path.join(os.tmpdir(), 'mani-lo-' + n + '.webp');
      writeFileSync(src, Buffer.from(out[n].split(',')[1], 'base64'));
      execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', src, '-vf', `scale='min(${n.startsWith('wall') ? 512 : 256},iw)':-2`, '-c:v', 'libwebp', '-quality', '50', ...(n === 'pecha-leaf' ? ['-pix_fmt', 'yuva420p'] : []), small]);
      const lb = `MANI_TEX(${JSON.stringify(n)},${JSON.stringify('data:image/webp;base64,' + readFileSync(small).toString('base64'))})`;
      writeFileSync(path.join(tdirOut, n + '.lo.js'), lb); lo = Math.max(1, Math.round(lb.length / 1024));
    }
    return { n, l: LABELS[n] || n, kb: Math.round(body.length / 1024), lo };
  });
  texTag = '<script>const TEXTURES={};const ASSETS=' + JSON.stringify(assets) + ';const OPENINGS=' + JSON.stringify({ win, door }) + ';</script>';
  console.log('window', win.map((v) => v.toFixed(2)).join(' '), 'door', door.map((v) => v.toFixed(2)).join(' '));
  console.log('textures: ' + (Object.keys(out).join(', ') || 'none'));
}
let js = `const AUDIO=${JSON.stringify(audio)};const TEACHING=${JSON.stringify(TEACHING)};const VIDEOS=${JSON.stringify(VIDEOS)};\n` + FILES.map((f) => readFileSync(path.join(here, 'src', f), 'utf8')).join('\n');
const tpl = readFileSync(path.join(here, 'template.html'), 'utf8');
const wrap = (body) => `(async()=>{${body}\n})().catch(e=>{console.error(e);window.__err=e.message;document.body.className='e';document.getElementById('s').textContent=e.message});`;

function pack(code) {
  const z = deflateRawSync(Buffer.from(code), { level: 9, memLevel: 9 }), BAD = [0, 13, 36, 60, 92, 96];
  let s = '', a = 0, k = 0;
  const put = (v) => { s += String.fromCharCode(BAD.includes(v) ? 256 + v : v); };
  for (const b of z) { a = (a << 8) | b; k += 8; while (k >= 7) { k -= 7; put((a >> k) & 127); } a &= (1 << k) - 1; }
  if (k) put((a << (7 - k)) & 127);
  return `(async()=>{const s=\`${s}\`,n=${z.length},b=new Uint8Array(n);for(let i=0,j=0,a=0,k=0;j<n;i++){a=a<<7|s.charCodeAt(i)&127;k+=7;if(k>7){k-=8;b[j++]=a>>k;a&=(1<<k)-1}}` +
    `const e=document.createElement("script");e.text=await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();document.body.append(e)})()` +
    `.catch(e=>{document.body.className="e";document.getElementById("s").textContent="Failed to start: "+e.message})`;
}

let html;
if (readable) html = tpl.replace('/*SCRIPT*/', () => wrap(js));
else {
  // GLSL keeps its lines, since its # directives must each stand on a line of their own
  const minGlsl = (s) => s.replace(/\/\/[^\n]*/g, '').split('\n').map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean).join('\n');
  js = js.replace(/\/\*glsl\*\/`([^`]*)`/g, (_, w) => '`' + minGlsl(w) + '`');
  const code = pack(transformSync(wrap(js), { minify: true, target: 'es2022', legalComments: 'none' }).code.trim());
  const css = (_, s) => '<style>' + transformSync(s, { loader: 'css', minify: true }).code.trim();
  html = tpl.replace(/<style>([^]*?)(?=<\/style>)/, css).replace(/>\s+</g, '><').replace('/*SCRIPT*/', () => code);
}
html = html.replace('<script>', () => texTag + '<script>');
writeFileSync(path.join(here, '..', 'index.html'), html);
const bytes = Buffer.byteLength(html), gz = gzipSync(Buffer.from(html), { level: 9 }).length;
console.log(`index.html: ${bytes.toLocaleString('en')} bytes (${(bytes / 1000).toFixed(1)} kB)${readable ? ' (readable)' : ' (packed)'}, ${(gz / 1000).toFixed(1)} kB gzipped; audio: ${audio.map((a) => a.src).join(', ') || 'none'}`);
