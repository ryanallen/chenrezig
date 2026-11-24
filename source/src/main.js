// The page: WebGL2 setup, the textures, the light bake, the controls, the background audio and the frame loop.
const Q = new URLSearchParams(location.search);
const T_OFF = +(Q.get('t') || 0); // ?t=seconds starts the room's clock there (to check a shower)
const BAKE_FRAMES = +(Q.get('bake') || 360);
const MAX_SPEED = 2;

const cv = document.getElementById('c');
const say = (t) => { document.getElementById('s').textContent = t; };
const gl = cv.getContext('webgl2', { antialias: false, alpha: false, preserveDrawingBuffer: true });
cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); document.body.className = 'e'; say('Your graphics card stopped drawing the temple. Reload the page to try again.'); });
if (!gl) throw new Error("This browser can't show the temple (it needs WebGL2). Try a current Chrome, Edge, Firefox or Safari.");
if (!gl.getExtension('EXT_color_buffer_float')) throw new Error("This graphics card can't show the temple (it's missing EXT_color_buffer_float).");
const floatBlend = !!gl.getExtension('EXT_float_blend');
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
window.__adapter = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';

// ---- the frame's size: the window's shape, as sharp as the screen allows up to about 1920 by 1080 worth of pixels,
// lowered if frames run slow ----
const dpr = Math.min(devicePixelRatio || 1, 2);
// a phone or tablet starts at a lower resolution: its GPU has a fraction of a desktop's for the same pixels
let scale = +(Q.get('scale') || (matchMedia('(pointer:coarse)').matches ? 0.6 : 1));
function resize() {
  const w = innerWidth * dpr, h = innerHeight * dpr, k = Math.min(1, Math.sqrt(1920 * 1080 / (w * h))) * scale;
  cv.width = Q.get('w') ? +Q.get('w') * scale : Math.round(w * k); cv.height = Math.round(cv.width * innerHeight / innerWidth);
}
resize();
addEventListener('resize', resize);

// ---- shaders ----
// The programs, compiled while the page stays live: the start page and its loading bar are drawn first, and where the
// browser compiles in the background (KHR_parallel_shader_compile) the page waits on it a frame at a time, so a slow
// graphics driver (Firefox with hardware acceleration off takes many seconds) never leaves the window blank.
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
async function programs(list) {
  const par = gl.getExtension('KHR_parallel_shader_compile');
  const made = list.map((item) => {
    const [vs, fs] = Array.isArray(item) ? item : [VS, item]; // a [vertex, fragment] pair, or a fragment over the full screen
    const p = gl.createProgram(), sh = [];
    for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); gl.attachShader(p, s); sh.push([s, src]);
    }
    gl.linkProgram(p);
    return { p, sh };
  });
  const t0 = performance.now();
  for (let i = 0; i < made.length; i++) {
    if (par) while (!gl.getProgramParameter(made[i].p, par.COMPLETION_STATUS_KHR)) { UI.shaders(i / made.length, (performance.now() - t0) / 1000); await nextFrame(); }
    UI.shaders((i + 1) / made.length, (performance.now() - t0) / 1000);
  }
  window.__compileMs = performance.now() - t0; // a check: how long the programs took to compile
  return made.map(({ p, sh }) => {
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      if (gl.isContextLost()) throw new Error('Your graphics card gave up while getting ready. A desktop browser or a newer phone should work.');
      for (const [s, src] of sh) if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s); console.error(log);
        const ln = +((log.match(/0:(\d+)/) || [])[1] || 0);
        throw new Error('Shader: ' + log.split('\n')[0] + (ln ? ' | ' + src.split('\n')[ln - 1] : ''));
      }
      throw new Error('Link: ' + gl.getProgramInfoLog(p));
    }
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name.replace('[0]', '')] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  });
}

// ---- textures: drawn at once in plain colours, each image put in as it streams in from tex/ (see load below) ----
async function image(src) { const i = new Image(); i.src = src; await i.decode(); return i; }
function pixels(img, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true });
  if (img) { x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h); }
  return x;
}
const T = TEXTURES;
const LAYER = {}; // image name -> the texture array and layer it fills
function mipmapArray(t) {
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, t); gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
}
function arrayTex(names, w, h, fallbacks) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
  const levels = Math.floor(Math.log2(Math.max(w, h))) + 1;
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, w, h, names.length);
  for (let i = 0; i < names.length; i++) {
    const x = pixels(null, w, h); x.fillStyle = fallbacks[i]; x.fillRect(0, 0, w, h);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, x.getImageData(0, 0, w, h).data);
    LAYER[names[i]] = { t, i, w, h };
  }
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
  return t;
}
function tex2d(src, w, h, wrapU, data) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapU ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// the start page and its loading bar first, painted before any heavy work
if (!Q.has('nomenu')) UI.menu.set(true);
UI.shaders(0, 0);
await nextFrame(); await nextFrame();
say('');
const walls = arrayTex(['wall-north', 'wall-east', 'wall-south', 'wall-west'], 2048, 1216, ['#5a4232', '#5a4232', '#5a4232', '#5a4232']);
const mats = arrayTex(['floor-planks', 'pillar-wood', 'pillar-brocade', 'capital', 'beam', 'ceiling', 'altar-front', 'door', 'whitewash', 'banner-silk'], 1024, 1024,
  ['#5a3a22', '#7a2a18', '#5a3a6a', '#4a6a5a', '#3a2418', '#2a1a10', '#6a2418', '#3a2214', '#d8d2c4', '#8a5a3a']);
const pechaT = arrayTex(['pecha-choktse-top', 'pecha-choktse-front', 'pecha-cover-board', 'pecha-silk', 'pecha-cushion', 'pecha-leaf', 'thumb-1'], 1024, 1024,
  ['#7a1a10', '#6a1a10', '#3a2214', '#c89a20', '#5a1a18', '#d8c8a0', '#101010']);
// The statue card: colour from statue.png with the green background keyed out in alpha, and its depth from
// statue-depth.png, smoothed and kept as half floats (8 bits terrace a close look into steps); empty until both are in.
let statueBox = [-3.65, -2.35, 0.95, 2.35], statueTex = tex2d(null, 1, 1, false, new Uint8Array(4)), statueD = tex2d(null, 1, 1, false, new Uint8Array(4));
const half = (() => { const f = new Float32Array(1), i = new Uint32Array(f.buffer);
  return (v) => { f[0] = v; const x = i[0], e = ((x >> 23) & 255) - 112, m = x & 0x7fffff; return e <= 0 ? 0 : (e << 10) | (m >> 13); }; })();
async function makeStatue() {
  const ci = await image(T['statue']), di = await image(T['statue-depth']);
  const w = Math.min(ci.naturalWidth, 1536), h = Math.round(w * ci.naturalHeight / ci.naturalWidth);
  const c = pixels(ci, w, h).getImageData(0, 0, w, h).data, d = pixels(di, w, h).getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4), dep = new Float32Array(w * h), tmp = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = c[i * 4], g = c[i * 4 + 1], b = c[i * 4 + 2];
    const key = g > 140 && g > r * 1.6 && g > b * 1.6;
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = key ? 0 : 255;
    dep[i] = key ? 0 : Math.max(8, d[i * 4]) / 255;
  }
  // a small Gaussian blur, inside the figure only, so its edge stays sharp
  const k = [0.06, 0.24, 0.4, 0.24, 0.06];
  for (const [src, dst, sx, sy] of [[dep, tmp, 1, 0], [tmp, dep, 0, 1]]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!out[i * 4 + 3]) { dst[i] = 0; continue; }
    let s = 0, n = 0;
    for (let j = -2; j <= 2; j++) { const xx = x + j * sx, yy = y + j * sy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue; const q = yy * w + xx; if (!out[q * 4 + 3]) continue; s += src[q] * k[j + 2]; n += k[j + 2]; }
    dst[i] = s / n;
  }
  const hd = new Uint16Array(w * h); for (let i = 0; i < w * h; i++) hd[i] = half(dep[i]);
  gl.deleteTexture(statueTex); statueTex = tex2d(null, w, h, false, out);
  gl.deleteTexture(statueD); statueD = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, statueD);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, hd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const sw = 1.3; statueBox = [-3 - sw / 2, -3 + sw / 2, 0.95, 0.95 + sw * h / w];
}
// The models (models.js, made in Blender): one buffer of vertices and one of indices, a vertex array for each model.
// Drawn each frame into the model buffers below, which the frame shader reads.
let MODELS = null;
async function makeModels(src) {
  const packed = new Uint8Array(await (await fetch(src)).arrayBuffer()), pv = new DataView(packed.buffer);
  const n = pv.getUint32(0, true), list = [];
  // undo the build's packing: each 16-bit field and index stored as differences, low and high bytes in runs of their own
  const buf = new ArrayBuffer(packed.length), dv = new DataView(buf);
  new Uint8Array(buf).set(packed.subarray(0, 4 + n * 12));
  for (let i = 0, at = 4 + n * 12; i < n; i++) {
    const nv = pv.getUint32(8 + i * 12, true), ni = pv.getUint32(12 + i * 12, true);
    for (let f = 0; f < 10; f++) { let x = 0; for (let v = 0; v < nv; v++) { x = (x + packed[at + f * 2 * nv + v] + (packed[at + (f * 2 + 1) * nv + v] << 8)) & 0xffff; dv.setUint16(at + v * 20 + f * 2, x, true); } }
    at += nv * 20;
    { let x = 0; for (let k = 0; k < ni; k++) { x = (x + packed[at + k] + (packed[at + ni + k] << 8)) & 0xffff; dv.setUint16(at + k * 2, x, true); } }
    at += Math.ceil(ni * 2 / 4) * 4;
  }
  let off = 4 + n * 12;
  const vbo = gl.createBuffer(), ibo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  for (let i = 0; i < n; i++) {
    const tex = dv.getUint32(4 + i * 12, true), nv = dv.getUint32(8 + i * 12, true), ni = dv.getUint32(12 + i * 12, true);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.SHORT, false, 20, off);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, 20, off + 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.UNSIGNED_SHORT, true, 20, off + 12);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.UNSIGNED_SHORT, true, 20, off + 16);
    off += nv * 20;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); // each model's indices sit in the same buffer, at their own offset
    list.push({ vao, tex, ni, at: off });
    off += Math.ceil(ni * 2 / 4) * 4;
  }
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buf, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  MODELS = list;
}
// The model buffers: colour (alpha says statue 1 or offering 0.5) and normal with the distance from the eye, at the
// frame's own size.
let gbuf = null;
function modelBuffers() {
  if (gbuf && gbuf.w === cv.width && gbuf.h === cv.height) return gbuf;
  if (gbuf) { gl.deleteFramebuffer(gbuf.f); gl.deleteTexture(gbuf.a); gl.deleteTexture(gbuf.n); gl.deleteRenderbuffer(gbuf.d); }
  const w = cv.width, h = cv.height, mk = (fmt, type, ifmt) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, fmt, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); return t; };
  const a = mk(gl.RGBA, gl.UNSIGNED_BYTE, gl.RGBA8), n = mk(gl.RGBA, gl.HALF_FLOAT, gl.RGBA16F);
  const d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, a, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, n, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  gbuf = { f, a, n, d, w, h };
  return gbuf;
}
let outTex = tex2d(null, 1, 1, false, new Uint8Array([200, 210, 230, 255]));
// The noise lattice: scene.js's hash3 of each corner of a 128-cube, worked in float32 as the shader works it, so the
// noise is the one the shader hashed before; repeating, as half floats the hardware blends (scene.js's noise3).
const noiseTex = (() => {
  const N = 128, v = new Uint16Array(N * N * N), F = Math.fround, fr = (x) => F(x - Math.floor(x));
  const h = (x, y, z) => {
    x = F(fr(F(F(x * F(0.3183099)) + F(0.71))) * 17); y = F(fr(F(F(y * F(0.3183099)) + F(0.113))) * 17); z = F(fr(F(F(z * F(0.3183099)) + F(0.419))) * 17);
    return fr(F(F(F(x * y) * z) * F(F(x + y) + z)));
  };
  for (let k = 0; k < N; k++) for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) v[(k * N + j) * N + i] = half(h(i, j, k));
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_3D, t);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, N, N, N, 0, gl.RED, gl.HALF_FLOAT, v);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return t;
})();
// The offerings' atlas: Codex's paintings of them on flat green, the green keyed out softly and pulled off the edges;
// and their depth, smoothed and kept as half floats like the statue's.
let offerTex = tex2d(null, 1, 1, false, new Uint8Array(4)), offerD = tex2d(null, 1, 1, false, new Uint8Array(4)), offerTop = tex2d(null, 1, 1, false, new Uint8Array(4));
// a painting on flat green as a texture, the green keyed out softly and pulled off the edges
function keyed(img) {
  const w = img.naturalWidth, h = img.naturalHeight, c = pixels(img, w, h).getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = c[i * 4], g = c[i * 4 + 1], b = c[i * 4 + 2], mx = Math.max(r, b), a = Math.max(0, Math.min(1, 1 - (g - mx - 40) / 60));
    out[i * 4] = r; out[i * 4 + 1] = a < 1 ? Math.min(g, mx) : g; out[i * 4 + 2] = b; out[i * 4 + 3] = Math.round(a * 255);
  }
  return tex2d(null, w, h, false, out);
}
async function makeOfferings() {
  const img = await image(T['offerings']), w = img.naturalWidth, h = img.naturalHeight;
  const c = pixels(img, w, h).getImageData(0, 0, w, h).data, out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const r = c[i * 4], g = c[i * 4 + 1], b = c[i * 4 + 2], m = Math.max(r, b);
    const a = Math.max(0, Math.min(1, 1 - (g - m - 40) / 60));
    out[i * 4] = r; out[i * 4 + 1] = a < 1 ? Math.min(g, m) : g; out[i * 4 + 2] = b; out[i * 4 + 3] = Math.round(a * 255);
  }
  gl.deleteTexture(offerTex); offerTex = tex2d(null, w, h, false, out);
  if (T['offerings-top']) { gl.deleteTexture(offerTop); offerTop = keyed(await image(T['offerings-top'])); }
  if (!T['offerings-depth']) return;
  const di = await image(T['offerings-depth']), d = pixels(di, w, h).getImageData(0, 0, w, h).data;
  const dep = new Float32Array(w * h), tmp = new Float32Array(w * h), k = [0.06, 0.24, 0.4, 0.24, 0.06];
  for (let i = 0; i < w * h; i++) dep[i] = d[i * 4] / 255;
  for (const [src, dst, sx, sy] of [[dep, tmp, 1, 0], [tmp, dep, 0, 1]]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0; for (let j = -2; j <= 2; j++) s += src[Math.min(h - 1, Math.max(0, y + j * sy)) * w + Math.min(w - 1, Math.max(0, x + j * sx))] * k[j + 2];
    dst[y * w + x] = s;
  }
  const hd = new Uint16Array(w * h); for (let i = 0; i < w * h; i++) hd[i] = half(dep[i]);
  gl.deleteTexture(offerD); offerD = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, offerD);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.HALF_FLOAT, hd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}
const [drumC, drumH] = drumCanvases();
const drumCT = tex2d(drumC, 0, 0, true), drumHT = tex2d(drumH, 0, 0, true);

// ---- streaming the images in: tex/<name>.js scripts, three at a time, in the build's order (ASSETS): first every
// image's quick copy (<name>.lo.js), then each at full size. Each lands through MANI_TEX, goes into its texture, and
// the light is gathered again over it. States: wait, load, quick (the quick copy is in), done, fail.
const LOAD = { list: ASSETS.map((a) => ({ ...a, state: 'wait', got: 0, tier: -1 })), relight: false };
window.MANI_TEX = (n, src) => { T[n] = src; };
async function place(n, src) {
  if (LAYER[n]) {
    const L = LAYER[n], img = await image(src);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, L.t);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, L.i, L.w, L.h, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels(img, L.w, L.h).getImageData(0, 0, L.w, L.h).data);
    mipmapArray(L.t);
  } else if ((n === 'statue' || n === 'statue-depth') && T['statue'] && T['statue-depth']) await makeStatue();
  else if ((n === 'offerings' || n === 'offerings-depth' || n === 'offerings-top') && T['offerings']) await makeOfferings();
  else if (n === 'models') await makeModels(src);
  else if (n === 'window-view') { const img = await image(src); gl.deleteTexture(outTex); outTex = tex2d(img, 0, 0, false); }
  LOAD.relight = true;
}
function loadAll() {
  const queue = [...LOAD.list.filter((a) => a.lo).map((a) => [a, 0]), ...LOAD.list.map((a) => [a, 1])];
  let next = 0;
  const one = () => {
    if (next >= queue.length) return;
    const [a, tier] = queue[next++]; if (a.state !== 'quick' || tier) a.state = 'load'; UI.loading(LOAD.list);
    const s = document.createElement('script'); s.src = 'tex/' + a.n + (tier ? '.js' : '.lo.js');
    const end = (ok) => { a.got += tier ? a.kb : a.lo; if (ok) { a.state = tier ? 'done' : a.tier > 0 ? a.state : 'quick'; } else if (tier) a.state = 'fail'; UI.loading(LOAD.list); one(); };
    s.onload = async () => {
      s.remove(); const src = T[a.n]; // read at once: another copy of the same image may land while this one decodes
      if (!src) return end(false);
      try { if (tier > a.tier) { a.tier = tier; await place(a.n, src); } end(true); } catch { end(false); }
    };
    s.onerror = () => { s.remove(); end(false); };
    document.head.append(s);
  };
  for (let i = 0; i < 3; i++) one();
}

// ---- the light volume ----
const VW = 32 * 6, VH = 32 * 19;
function floatTarget(fmt) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt, VW, VH, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  return { t, f };
}
const acc = floatTarget(floatBlend ? gl.RGBA32F : gl.RGBA16F), vol = floatTarget(gl.RGBA16F);

// the images first, so the list fills and ticks while the visitor watches: the quick copies of all of them (half a
// megabyte) land before the shaders compile, which on some browsers holds the page still; the full sizes carry on after
UI.loading(LOAD.list); loadAll();
await Promise.race([new Promise((r) => setTimeout(r, 6000)), (async () => { while (LOAD.list.some((a) => a.lo && a.state === 'wait' || a.state === 'load' && a.tier < 0)) await nextFrame(); })()]);
await nextFrame();
// ?no=clouds,fog,rain,plume,beam,handles: a check that leaves those effects out, to measure what each costs
const NO = (Q.get('no') || '').split(',').filter(Boolean).map((n) => `\n#define NO_${n.toUpperCase()}\n`).join('');
const [bakeP, normP, frameP, meshP, zeroP] = await programs([BAKE.replace('#version 300 es', '#version 300 es' + NO), NORM, FRAME.replace('#version 300 es', '#version 300 es' + NO), [MESH_VS, MESH_FS], `#version 300 es
precision highp float;out vec4 o;void main(){o=vec4(0.);}`]);
gl.bindVertexArray(gl.createVertexArray());

function bindCommon(P) {
  const u = P.u; gl.useProgram(P.p);
  const units = [['uWalls', gl.TEXTURE_2D_ARRAY, walls], ['uMats', gl.TEXTURE_2D_ARRAY, mats], ['uStatue', gl.TEXTURE_2D, statueTex], ['uOut', gl.TEXTURE_2D, outTex],
    ['uDrumC', gl.TEXTURE_2D, drumCT], ['uDrumH', gl.TEXTURE_2D, drumHT], ['uVol', gl.TEXTURE_2D, vol.t], [null], ['uPecha', gl.TEXTURE_2D_ARRAY, pechaT], ['uOffer', gl.TEXTURE_2D, offerTex], ['uStatueD', gl.TEXTURE_2D, statueD], ['uOfferD', gl.TEXTURE_2D, offerD], ['uNoise', gl.TEXTURE_3D, noiseTex], ['uOfferTop', gl.TEXTURE_2D, offerTop]]; // unit 7 is the bake's accumulator, bound by the normalize pass
  units.forEach(([n, target, t], i) => { if (!n) return; gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(target, t); if (u[n]) gl.uniform1i(u[n], i); });
  if (u.uStatueBox) gl.uniform4fv(u.uStatueBox, statueBox);
  if (u.uWinR) gl.uniform4fv(u.uWinR, OPEN.win);
  if (u.uDoorR) gl.uniform3fv(u.uDoorR, OPEN.door);
  if (u.uSun) gl.uniform3fv(u.uSun, SUN_DIR);
}
// Showers: two streams, each starting every 47 or 61 seconds at a place of its own and raining about a quarter of
// a minute, drifting with the clouds' wind; [x, z, strength] for each, for the shader.
const hash3 = (x, y, z) => { const f = (v) => v - Math.floor(v); x = f(x * 0.3183099 + 0.71) * 17; y = f(y * 0.3183099 + 0.113) * 17; z = f(z * 0.3183099 + 0.419) * 17; return f(x * y * z * (x + y + z)); };
const hash1 = (x) => hash3(x, x * 0.37, 1.3);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function showers(time) {
  const out = [];
  for (let s = 0; s < 2; s++) {
    const P = s ? 61 : 47, tt = time + s * 23, k = Math.floor(tt / P), ph = tt - k * P;
    out.push(hash1(k * 1.7 + s) * 5.6 - 2.8 - 0.11 * ph, hash1(k * 3.1 + s + 9) * 5.6 - 2.8 - 0.045 * ph, smooth(0, 3, ph) * (1 - smooth(13, 17, ph)));
  }
  return out;
}
// The window and door where the wall textures paint them; the sun, low in the east, comes through the window onto the wheel.
const OPEN = typeof OPENINGS === 'object' ? OPENINGS : { win: [-1.2, 2.95, 0.7, 0.6], door: [-1.4, 2.2, 0.55] };
const SUN_DIR = (() => { const v = [4, OPEN.win[1] - 1.75, OPEN.win[0]]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

// ---- speed: the scroll wheel or trackpad, Up/Down arrows ----
let target = Q.get('speed') !== null ? +Q.get('speed') : 0.15, omega = target * 2 * Math.PI, phi = 0;
const hud = document.getElementById('v');
let hudT = 0;
function setSpeed(v) {
  target = Math.max(0, Math.min(MAX_SPEED, v));
  hud.textContent = target < 0.005 ? 'Stopped' : target.toFixed(2) + ' turns per second';
  hud.style.opacity = 1; hudT = performance.now();
  startAudio();
}
// Each scroll event moves the speed a little and never more than 0.03 turns a second, so a fast or accelerated first
// flick of the wheel (browsers report anything from 3 lines to several hundred pixels for one notch) cannot throw it fast.
addEventListener('wheel', (e) => {
  if (UI.open) return; e.preventDefault();
  const d = e.deltaY * (e.deltaMode === 1 ? 0.01 : e.deltaMode === 2 ? 0.3 : 0.0004);
  setSpeed(target - Math.max(-0.03, Math.min(0.03, d)));
}, { passive: false });

// ---- looking and walking, as in a first-person game: click to take the mouse, Esc to give it back ----
const EYE = 1.6;
let pos = (Q.get('pos') || '2.59,-0.78').split(',').map(Number), yaw = +(Q.get('yaw') || -107), pitch = +(Q.get('pitch') || -2); // on the line from the window to the wheel, so the sunlight falls in the middle of the view
const keys = new Set();
// The pecha and the phone on the choktse (positions as in scene.js), picked by the ray through the view's centre,
// or through the point clicked or tapped when the mouse is free.
const CHOK = [0.85, 1.75], CHOK_H = 0.36;
const THINGS = [
  { k: 'pecha', c: [CHOK[0] - 0.08, CHOK_H + 0.045, CHOK[1]], h: [0.28, 0.045, 0.065], say: 'read the teaching' },
  { k: 'phone', c: [CHOK[0] + 0.27, CHOK_H + 0.01, CHOK[1]], h: [0.055, 0.025, 0.1], say: 'watch the videos' },
];
function view() {
  const y = yaw * Math.PI / 180, p = pitch * Math.PI / 180;
  const f = [Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)], r = [Math.cos(y), 0, Math.sin(y)];
  return { f, r, up: [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]] };
}
// the ray through the view's centre, or through a point on the screen
function rayAt(cx, cy) {
  const { f, r, up } = view(), b = cv.getBoundingClientRect();
  const qx = cx == null ? 0 : (2 * (cx - b.left) - b.width) / b.height * fov(), qy = cy == null ? 0 : (b.height - 2 * (cy - b.top)) / b.height * fov();
  return { d: [0, 1, 2].map((i) => r[i] * qx + up[i] * qy + f[i]), o: [pos[0], EYE, pos[1]] };
}
// Is the drum within reach along that ray? (its side, 0.4 to 3.3 m up, within 2.6 m)
function onWheel(cx, cy) {
  const { o, d } = rayAt(cx, cy), a = d[0] * d[0] + d[2] * d[2], b = o[0] * d[0] + o[2] * d[2], c = o[0] * o[0] + o[2] * o[2] - 0.82 * 0.82;
  const disc = b * b - a * c; if (disc < 0) return false;
  const t = (-b - Math.sqrt(disc)) / a, y = o[1] + d[1] * t;
  return t > 0 && t < 2.6 && y > 0.4 && y < 3.3;
}
// Pushing the wheel by hand: the drum's face moves right to left, so a drag leftward pushes it faster and one rightward
// brakes it; a full screen width of drag is the whole range.
function pushWheel(dxPx) { tipSeen = TIP_TIME; setSpeed(target - dxPx / innerWidth * MAX_SPEED * 1.5); }
// the hint on how to spin the wheel shows for TIP_TIME seconds in all, and never again once the wheel has been pushed
const TIP_TIME = 2; let tipSeen = 0;
let grab = false;
function pick(cx, cy) {
  const { o, d } = rayAt(cx, cy);
  let best = null, bt = 2.6;
  for (const t of THINGS) {
    let a = 0, z = bt;
    for (let i = 0; i < 3; i++) {
      const t0 = (t.c[i] - t.h[i] - o[i]) / d[i], t1 = (t.c[i] + t.h[i] - o[i]) / d[i];
      a = Math.max(a, Math.min(t0, t1)); z = Math.min(z, Math.max(t0, t1));
    }
    if (a < z) { best = t; bt = a; }
  }
  return best;
}
const tipEl = document.getElementById('h'), dot = document.getElementById('d');
UI.keysUp = () => { keys.clear(); stick = null; looks.clear(); speedFrom = null; showStick(false); };
UI.hooks.pause = () => { if (audio && !audio.paused) { audio.pause(); audio.__held = true; } };
UI.hooks.resume = () => { if (audio && audio.__held) { audio.__held = false; audio.play().catch(() => {}); } };
// iPhone Safari has no pointer lock, and newer browsers answer with a promise that may refuse
function lock() { try { const p = cv.requestPointerLock && cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
UI.hooks.relock = () => { startAudio(); lock(); };
cv.addEventListener('click', (e) => {
  startAudio();
  if (grab && grab.moved > 3) return; // that was a push on the wheel, not a click
  const locked = document.pointerLockElement === cv, t = locked ? pick() : pick(e.clientX, e.clientY);
  if (t) UI.show(t.k); else if (!locked) lock();
});
// hold the mouse button on the wheel and drag to push it (with the mouse taken, aim at it first)
cv.addEventListener('mousedown', (e) => { if (e.button !== 0 || UI.open) return; const locked = document.pointerLockElement === cv; if (locked ? onWheel() : onWheel(e.clientX, e.clientY)) { grab = { x: e.clientX, moved: 0 }; startAudio(); } });
addEventListener('mouseup', () => { setTimeout(() => { grab = false; }, 0); });
addEventListener('mousemove', (e) => {
  if (grab) { const dx = document.pointerLockElement === cv ? e.movementX : e.clientX - grab.x; grab.x = e.clientX; grab.moved += Math.abs(dx); pushWheel(dx); return; }
  if (document.pointerLockElement !== cv) return;
  yaw += e.movementX * 0.12; pitch = Math.max(-75, Math.min(80, pitch - e.movementY * 0.12));
});
const MOVE = new Set(['w', 'a', 's', 'd', 'arrowleft', 'arrowright']);
addEventListener('keydown', (e) => {
  if (UI.open) return;
  const k = e.key.toLowerCase();
  if (k === 'e') { const t = pick(); if (t) UI.show(t.k); }
  else if (k === 'arrowup') setSpeed(target + 0.05);
  else if (k === 'arrowdown') setSpeed(target - 0.05);
  else if (MOVE.has(k)) { keys.add(k); startAudio(); }
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
// ---- touch, as in a mobile first-person game: a thumb on the left half is a joystick that walks (it appears where the
// thumb lands), a finger on the right half looks (the view turns the way the finger moves) and a tap there picks up
// what it lands on; both at once. Two fingers on the right half dragged up or down change the wheel's speed. ----
const STICK_R = 56;
const stickBase = document.createElement('div'), stickKnob = document.createElement('div');
stickBase.id = 'jb'; stickKnob.id = 'jk'; document.body.append(stickBase, stickKnob);
let stick = null; // { id, x, y, dx, dy } with dx, dy in -1..1
const looks = new Map(); // touch id -> { x, y, x0, y0, t0, moved }
let speedFrom = null;
function showStick(on) {
  stickBase.style.opacity = stickKnob.style.opacity = on ? 1 : 0;
  if (!stick) return;
  stickBase.style.transform = `translate(${stick.x - STICK_R}px,${stick.y - STICK_R}px)`;
  stickKnob.style.transform = `translate(${stick.x + stick.dx * STICK_R - 24}px,${stick.y + stick.dy * STICK_R - 24}px)`;
}
addEventListener('touchstart', (e) => {
  if (UI.open) return; startAudio();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && !stick && !onWheel(t.clientX, t.clientY)) { stick = { id: t.identifier, x: t.clientX, y: t.clientY, dx: 0, dy: 0, t0: performance.now(), moved: false }; showStick(true); }
    else looks.set(t.identifier, { x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now(), moved: false, wheel: onWheel(t.clientX, t.clientY) });
  }
  if (looks.size === 2) speedFrom = { y: [...looks.values()].reduce((a, l) => a + l.y, 0) / 2, s: target };
}, { passive: true });
addEventListener('touchmove', (e) => {
  if (UI.open) return;
  for (const t of e.changedTouches) {
    if (stick && t.identifier === stick.id) {
      let dx = (t.clientX - stick.x) / STICK_R, dy = (t.clientY - stick.y) / STICK_R; const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      if (m > 0.2) stick.moved = true;
      stick.dx = dx; stick.dy = dy; showStick(true);
    } else if (looks.has(t.identifier)) {
      const l = looks.get(t.identifier);
      if (Math.hypot(t.clientX - l.x0, t.clientY - l.y0) > 10) l.moved = true;
      if (l.wheel) pushWheel(t.clientX - l.x); // a finger that landed on the drum pushes it
      else if (looks.size === 1) { yaw += (t.clientX - l.x) * 0.22; pitch = Math.max(-75, Math.min(80, pitch - (t.clientY - l.y) * 0.22)); }
      l.x = t.clientX; l.y = t.clientY;
    }
  }
  if (looks.size === 2 && speedFrom) setSpeed(speedFrom.s + (speedFrom.y - [...looks.values()].reduce((a, l) => a + l.y, 0) / 2) / innerHeight * MAX_SPEED);
  e.preventDefault();
}, { passive: false });
function touchEnd(e) {
  for (const t of e.changedTouches) {
    if (stick && t.identifier === stick.id) {
      // a tap on the left half that never walked picks up what it lands on too
      const tap = e.type === 'touchend' && !stick.moved && performance.now() - stick.t0 < 400 && pick(stick.x, stick.y);
      stick = null; showStick(false);
      if (tap && !UI.open) { e.preventDefault(); UI.show(tap.k); }
      continue;
    }
    const l = looks.get(t.identifier); if (!l) continue;
    looks.delete(t.identifier);
    // a tap picks up the pecha or the phone where it lands
    if (e.type === 'touchend' && !l.moved && !UI.open && looks.size === 0 && performance.now() - l.t0 < 400) { const p = pick(l.x0, l.y0); if (p) { e.preventDefault(); UI.show(p.k); } }
  }
  if (looks.size < 2) speedFrom = null;
}
addEventListener('touchend', touchEnd); addEventListener('touchcancel', touchEnd);
const TOUCH = matchMedia('(pointer:coarse)').matches;

// Where the visitor can stand: inside the walls, clear of the wheel, the pillars, the altar and the lamp stands.
function free(x, z) {
  if (Math.abs(x) > 3.65 || Math.abs(z) > 3.65) return false;
  if (Math.hypot(x, z) < 1.25) return false;
  for (const [px, pz] of [[-2.4, -2.2], [2.4, -2.2], [-2.4, 2.2], [2.4, 2.2]]) if (Math.abs(x - px) < 0.45 && Math.abs(z - pz) < 0.45) return false;
  if (x < -1.8 && z < -2.4) return false;
  if (x < -1.1 && z < -2.85) return false; // the nga drum beside the altar
  for (const [px, pz] of [[-1.75, 1.1], [1.75, 1.1]]) if (Math.hypot(x - px, z - pz) < 0.4) return false;
  if (Math.abs(x - 0.85) < 0.55 && z > 1.35 && z < 2.55) return false; // the choktse and its cushion
  return true;
}

// ---- background audio: the files the build lists in AUDIO, the compressed one first, looping ----
let audio = null;
function startAudio() {
  if (audio || typeof AUDIO === 'undefined' || !AUDIO.length || Q.has('mute')) return;
  audio = new Audio(); audio.loop = true; audio.volume = 0.7;
  const pick = AUDIO.find((f) => audio.canPlayType(f.type)) || AUDIO[0];
  audio.src = pick.src; window.__audio = audio; audio.play().catch(() => { audio = null; });
}

// ---- frame loop ----
const TIMING = Q.has('timing') ? new Uint8Array(4) : null;
const FOV = Math.tan((+(Q.get('fov') || 70)) * Math.PI / 360);
// the vertical field of view, widened on a tall window so the view across it never narrows below about 62 degrees
const fov = () => Math.max(FOV, 0.6 * innerHeight / innerWidth);
let baked = 0, bakeSeed = 0, last = performance.now(), t0 = last, slow = 0;
document.body.classList.add('r');
say('');
window.__UI = UI; window.__view = () => ({ pos: [...pos], yaw, pitch });
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  omega += (target * 2 * Math.PI - omega) * Math.min(dt * 1.2, 1);
  phi = (phi + omega * dt) % (2 * Math.PI);
  if (now - hudT > 1800) hud.style.opacity = 0;
  // walk
  // the keys, or the touch joystick's push (how far it is pushed sets how fast)
  let fw = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), sd = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0), push = 1;
  if (stick && Math.hypot(stick.dx, stick.dy) > 0.12) { fw = -stick.dy; sd = stick.dx; push = Math.min(1, Math.hypot(fw, sd)); }
  if (fw || sd) {
    const y = yaw * Math.PI / 180, sp = 1.3 * dt * push / Math.hypot(fw, sd);
    const dx = (Math.sin(y) * fw + Math.cos(y) * sd) * sp, dz = (-Math.cos(y) * fw + Math.sin(y) * sd) * sp;
    if (free(pos[0] + dx, pos[1])) pos[0] += dx;
    if (free(pos[0], pos[1] + dz)) pos[1] += dz;
  }
  // a newly landed image: keep a fiftieth of the light gathered so far and gather it again over the new surfaces
  if (LOAD.relight) {
    LOAD.relight = false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.f); gl.viewport(0, 0, VW, VH); gl.useProgram(zeroP.p);
    gl.enable(gl.BLEND); gl.blendColor(0, 0, 0, 0.02); gl.blendFunc(gl.ZERO, gl.CONSTANT_ALPHA); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND);
    baked = 0;
  }
  // bake a little more light while there is any left to gather
  const steps = baked < BAKE_FRAMES ? (Q.has('fastbake') ? 4 : 1) : 0;
  for (let i = 0; i < steps; i++) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.f); gl.viewport(0, 0, VW, VH);
    bindCommon(bakeP); gl.uniform1f(bakeP.u.uFrame, bakeSeed++);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, vol.f); gl.useProgram(normP.p);
    gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, acc.t); gl.uniform1i(normP.u.uAcc, 7);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    baked++;
  }
  // while the pecha or the phone is held the room is not drawn (the last frame stays behind it)
  const loaded = LOAD.list.every((x) => x.state === 'done' || x.state === 'fail');
  window.__spp = loaded ? baked : 0; window.__scale = scale;
  UI.light(loaded ? Math.min(1, baked / BAKE_FRAMES) : 0);
  if (UI.open === 'pecha' || UI.open === 'phone') { requestAnimationFrame(frame); return; }
  // what the view's centre rests on, said under it
  const locked = document.pointerLockElement === cv, aim = locked || (TOUCH && !UI.open) ? pick() : null;
  dot.style.opacity = locked || TOUCH ? 1 : 0;
  let wheelTip = tipSeen < TIP_TIME && !aim && (locked || TOUCH) && !UI.open && onWheel() ? (TOUCH ? 'Drag across the wheel to spin it' : 'Click and drag across the wheel to spin it') : '';
  if (wheelTip) tipSeen += dt;
  if (aim || wheelTip) tipEl.textContent = aim ? (TOUCH ? 'Tap to ' : 'Click to ') + aim.say : wheelTip; tipEl.style.opacity = aim || wheelTip ? 1 : 0; // fades out as it goes
  // the frame
  const { f, r, up } = view();
  // the models, drawn into the model buffers with the frame's camera
  const G = MODELS ? modelBuffers() : null;
  if (G) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.f); gl.viewport(0, 0, G.w, G.h);
    gl.clearBufferfv(gl.COLOR, 0, [0, 0, 0, 0]); gl.clearBufferfv(gl.COLOR, 1, [0, 0, 0, 0]); gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    bindCommon(meshP); const mu = meshP.u;
    gl.uniform2f(mu.uRes, cv.width, cv.height); gl.uniform1f(mu.uFov, fov()); gl.uniform3f(mu.uCam, pos[0], EYE, pos[1]);
    gl.uniformMatrix3fv(mu.uView, false, [...r, ...up, ...f]);
    for (const M of MODELS) { gl.uniform1i(mu.uWhich, M.tex); gl.bindVertexArray(M.vao); gl.drawElements(gl.TRIANGLES, M.ni, gl.UNSIGNED_SHORT, M.at); }
    gl.bindVertexArray(null); gl.disable(gl.DEPTH_TEST);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cv.width, cv.height);
  bindCommon(frameP);
  const u = frameP.u;
  if (u.uModels) gl.uniform1f(u.uModels, G ? 1 : 0);
  if (G) { gl.activeTexture(gl.TEXTURE14); gl.bindTexture(gl.TEXTURE_2D, G.a); gl.uniform1i(u.uMA, 14); gl.activeTexture(gl.TEXTURE15); gl.bindTexture(gl.TEXTURE_2D, G.n); gl.uniform1i(u.uMN, 15); }
  gl.uniform2f(u.uRes, cv.width, cv.height);
  gl.uniform1f(u.uTime, (now - t0) / 1000 + T_OFF); gl.uniform1f(u.uPhi, phi); gl.uniform1f(u.uBlur, omega * dt * 0.5); // the turn during half the frame: a 180-degree shutter at the screen's own rate
  gl.uniform1f(u.uExpo, +(Q.get('expo') || 3.2)); gl.uniform1f(u.uFov, fov()); gl.uniform1f(u.uTone, Q.get('tone') === 'aces' ? 1 : 0);
  gl.uniform3f(u.uCam, pos[0], EYE, pos[1]);
  if (u.uShower) gl.uniform3fv(u.uShower, showers((now - t0) / 1000 + T_OFF));
  gl.uniformMatrix3fv(u.uView, false, [...r, ...up, ...f]);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (TIMING) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, TIMING); // ?timing: wait for the GPU each frame, so frame times are real
  if (window.__bench) { // a check: the frame drawn __bench times over, waiting for the GPU each time, its cost in ms
    const n = window.__bench, px = new Uint8Array(4); window.__bench = 0;
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t = performance.now();
    for (let i = 0; i < n; i++) { gl.drawArrays(gl.TRIANGLES, 0, 3); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    window.__benchMs = (performance.now() - t) / n;
  }
  // lower the resolution in steps while frames run slower than about 40 a second (after the bake)
  if (baked >= BAKE_FRAMES && !Q.get('scale')) { slow = dt > 0.026 ? slow + 1 : 0; if (slow > 30 && scale > 0.35) { scale -= 0.08; resize(); slow = 0; } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
