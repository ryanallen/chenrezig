// The wheel's texture, drawn with canvas at load: colour, and height with a gilt mask (r height, g gilt).
// It runs once round the drum in u (4096 px for 2*pi) and from y 3.6 m (top) to 0.45 m in v.
const TW = 4096, TH = 2048;
const PXM = TW / (2 * Math.PI * 0.78), PYM = TH / 3.15;
const Y = (y) => (3.6 - y) * PYM;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const MANTRA = ['ཨོཾ', 'མ', 'ཎི', 'པ', 'དྨེ', 'ཧཱུྃ'];
const SOUNDS = ['OM', 'MA', 'NI', 'PAD', 'ME', 'HUM'];
const FONT = '"Microsoft Himalaya","Noto Serif Tibetan","Jomolhari","Kailasa",serif';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// Each shape is drawn twice, into the colour canvas and into the height canvas (r = height, g = gilt).
function both(C, H, fn, col, h, metal = 1) {
  C.fillStyle = C.strokeStyle = col; fn(C);
  const v = Math.round(h * 255);
  H.fillStyle = H.strokeStyle = `rgb(${v},${metal ? 255 : 0},0)`; fn(H);
}
const gold = () => { const k = 0.9 + rand() * 0.2; return `rgb(${Math.min(255, 228 * k) | 0},${Math.min(255, 172 * k) | 0},${(72 * k) | 0})`; };

function petalRow(C, H, y0, y1, n, up, rows = 1) {
  const w = TW / n, hgt = Math.abs(Y(y1) - Y(y0)), top = Math.min(Y(y0), Y(y1));
  both(C, H, (x) => x.fillRect(0, top, TW, hgt), '#8a5a1e', 0.25);
  for (let r = 0; r < rows; r++) for (let i = 0; i < n + 1; i++) {
    const cx = (i + (r % 2) * 0.5) * w;
    const base = up ? top + hgt : top, tip = up ? top + hgt * (r ? 0.35 : 0.05) : top + hgt * 0.95;
    const sh = (s, x) => {
      x.beginPath();
      x.moveTo(cx - w * 0.48 * s, base);
      x.bezierCurveTo(cx - w * 0.55 * s, base + (tip - base) * 0.5, cx - w * 0.1 * s, tip + (base - tip) * 0.15, cx, tip);
      x.bezierCurveTo(cx + w * 0.1 * s, tip + (base - tip) * 0.15, cx + w * 0.55 * s, base + (tip - base) * 0.5, cx + w * 0.48 * s, base);
      x.closePath(); x.fill();
    };
    both(C, H, (x) => sh(1, x), gold(), 0.65);
    both(C, H, (x) => sh(0.62, x), gold(), 0.9);
    both(C, H, (x) => { x.lineWidth = 2; x.beginPath(); x.moveTo(cx, base); x.lineTo(cx, tip + (base - tip) * 0.25); x.stroke(); }, '#7a4a14', 0.55);
  }
}
function beads(C, H, y, r, step, stones) {
  for (let x = step / 2, k = 0; x < TW; x += step, k++) {
    const s = stones && k % 4 === 0;
    both(C, H, (c) => { c.beginPath(); c.arc(x, Y(y), s ? r * 1.5 : r, 0, 7); c.fill(); }, s ? (k % 8 ? '#2aa198' : '#b8321e') : gold(), 1, s ? 0 : 1);
  }
}
function band(C, H, y0, y1, h = 0.5) { both(C, H, (c) => c.fillRect(0, Y(y1), TW, Y(y0) - Y(y1)), gold(), h); }

// The eight auspicious symbols, simplified, in a cell of size s centred at (x, y).
function symbol(c, k, x, y, s) {
  c.save(); c.translate(x, y); c.scale(s / 100, s / 100); c.lineWidth = 7; c.lineCap = c.lineJoin = 'round';
  const P = (d) => { const p = new Path2D(d); c.fill(p); };
  switch (k) {
    case 0: P('M-40 -10 Q0 -50 40 -10 Z'); c.fillRect(-3, -40, 6, 80); for (const dx of [-30, -10, 10, 30]) c.fillRect(dx - 2, -10, 4, 28); break;
    case 1: P('M-30 30 Q-60 -10 -20 -45 Q-25 0 -5 35 Z'); P('M30 30 Q60 -10 20 -45 Q25 0 5 35 Z'); break;
    case 2: P('M-12 -45 h24 v12 Q38 -20 30 15 Q20 40 0 42 Q-20 40 -30 15 Q-38 -20 -12 -33 Z'); break;
    case 3: for (let i = 0; i < 7; i++) { c.save(); c.rotate((i - 3) * 0.42); P('M0 30 Q-14 -5 0 -42 Q14 -5 0 30 Z'); c.restore(); } break;
    case 4: P('M0 -45 Q35 -30 28 10 Q20 40 0 45 Q-25 30 -22 0 Q-20 -30 0 -45 Z'); break;
    case 5: c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(-35, i * 14); c.lineTo(35, i * 14); c.moveTo(i * 14, -35); c.lineTo(i * 14, 35); } c.rotate(0.785); c.stroke(); c.strokeRect(-36, -36, 72, 72); break;
    case 6: P('M-22 -42 h44 v52 h-44 Z'); for (const dx of [-18, -6, 6, 18]) c.fillRect(dx - 3, 10, 6, 28); c.fillRect(-3, -50, 6, 10); break;
    default: c.beginPath(); c.arc(0, 0, 38, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * 0.785); c.fillRect(-2.5, 8, 5, 32); c.fillRect(-6, 38, 12, 9); c.restore(); }
  }
  c.restore();
}

function drumCanvases() {
  const [cc, C] = canvas(TW, TH), [hc, H] = canvas(TW, TH);
  C.fillStyle = '#922417'; C.fillRect(0, 0, TW, TH);
  H.fillStyle = '#000'; H.fillRect(0, 0, TW, TH);
  // lacquer: mottling and fine crazing
  for (let i = 0; i < 9000; i++) { C.fillStyle = `rgba(${rand() < 0.5 ? '40,6,4' : '140,40,24'},${0.05 + rand() * 0.08})`; C.beginPath(); C.arc(rand() * TW, rand() * TH, 4 + rand() * 30, 0, 7); C.fill(); }
  C.strokeStyle = 'rgba(30,5,3,0.35)'; C.lineWidth = 1;
  for (let i = 0; i < 14000; i++) { let x = rand() * TW, y = rand() * TH; C.beginPath(); C.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (rand() - 0.5) * 22; y += (rand() - 0.5) * 22; C.lineTo(x, y); } C.stroke(); }
  // bands from the bottom up
  band(C, H, 0.45, 0.53, 0.45);
  petalRow(C, H, 0.53, 0.84, 40, true);
  band(C, H, 0.84, 0.9, 0.3); beads(C, H, 0.87, 9, 26, false);
  // copper showing through where hands push, just above the handles
  for (let i = 0; i < 1200; i++) {
    const y = 1.13 + Math.abs(rand() - rand()) * 0.35, x = rand() * TW, r = 8 + rand() * 30;
    C.fillStyle = `rgba(${150 + rand() * 40 | 0},${70 + rand() * 30 | 0},${35 + rand() * 20 | 0},0.3)`; C.beginPath(); C.ellipse(x, Y(y), r * 1.8, r, 0, 0, 7); C.fill();
  }
  band(C, H, 1.4, 1.43, 0.5);
  // the mantra, twice round the drum: six gilt syllables, each with its sound in English under it, dots between
  // Each syllable is centred on its own height in the field between the English and the band above (2.07 m), at the
  // size OM is drawn 0.28 m tall; the English under them shrinks only if the tallest syllable would come within 2 cm.
  const tall = 0.28 * PYM, aspect = PXM / PYM, slot = TW / 12, TOP = 2.05, GAP = 0.02;
  C.font = H.font = `400px ${FONT}`;
  const om = C.measureText('ཨོཾ'), scl = tall / (om.actualBoundingBoxAscent + om.actualBoundingBoxDescent + 1);
  const ext = MANTRA.map((w) => { const t = C.measureText(w); return [t.actualBoundingBoxAscent * scl / PYM, t.actualBoundingBoxDescent * scl / PYM]; });
  const tallest = Math.max(...ext.map(([a, d]) => a + d));
  const EN = 1.475, enH0 = 0.115, enTop = (h) => EN + h * 0.4; // the capitals' tops, about 0.4 of the font size above the middle
  const enH = Math.min(enH0, (TOP - tallest - GAP - EN) / 0.4);
  const mid = (enTop(enH) + GAP + TOP) / 2; // the middle of the field the syllables share
  for (let k = 0; k < 12; k++) {
    const x = (k + 0.5) * slot, w = MANTRA[k % 6], [a, d] = ext[k % 6];
    const base = mid - (a - d) / 2; // the baseline that puts this syllable's own middle at the field's middle
    both(C, H, (c) => {
      c.save(); c.translate(x, Y(base)); c.scale(scl * aspect, scl);
      c.font = `400px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(w, 0, 0); c.restore();
    }, gold(), 1);
    both(C, H, (c) => {
      c.save(); c.translate(x, Y(EN)); c.scale(aspect, 1);
      c.font = `700 ${Math.round(enH * PYM)}px Georgia,"Times New Roman",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      if ('letterSpacing' in c) c.letterSpacing = `${Math.round(0.012 * PYM)}px`;
      c.fillText(SOUNDS[k % 6], 0, 0); c.restore();
    }, gold(), 0.8);
    both(C, H, (c) => { for (const dx of [0, -TW]) { c.beginPath(); c.arc(x + slot / 2 + dx, Y(mid), 12, 0, 7); c.fill(); } }, gold(), 0.9); // the last dot lies on the seam: drawn at both ends
  }
  band(C, H, 2.07, 2.1, 0.5);
  petalRow(C, H, 2.4, 2.1, 40, false);
  band(C, H, 2.4, 2.5, 0.3); beads(C, H, 2.45, 10, 34, true);
  // eight symbols, twice round
  for (let k = 0; k < 16; k++) both(C, H, (c) => symbol(c, k % 8, (k + 0.5) * TW / 16, Y(2.62), 0.2 * PYM), gold(), 0.85);
  band(C, H, 2.74, 2.8, 0.5);
  // the crown dome: two rows of upturned petals, then the finial
  petalRow(C, H, 2.8, 3.1, 24, true, 2);
  band(C, H, 3.1, 3.6, 0.5);
  both(C, H, (c) => c.fillRect(0, Y(3.42), TW, Y(3.3) - Y(3.42)), '#a01818', 0.6, 0);
  // soften the height field so relief edges are rounded, not stepped
  const [bc, B] = canvas(TW, TH); B.filter = 'blur(2.5px)'; B.drawImage(hc, 0, 0);
  return [cc, bc];
}

