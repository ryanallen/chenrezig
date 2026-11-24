// Renders the page in headless Edge with WebGPU and saves a PNG of the view.
// node shot.mjs [name] [samples] [speed] [page]   e.g. node shot.mjs still 256 0
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [name = 'view', spp = '256', speed = '', page = 'index.html', extra = ''] = process.argv.slice(2);
const out = path.join(here, '..', 'shots');
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars', ...(process.env.UNCAPPED ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [])],
  defaultViewport: process.env.VIEW ? { width: +process.env.VIEW.split('x')[0], height: +process.env.VIEW.split('x')[1], isMobile: !!process.env.MOBILE, hasTouch: !!process.env.MOBILE, deviceScaleFactor: process.env.MOBILE ? 3 : 1 } : { width: 1536, height: 864 },
});
const tab = await browser.newPage();
const logs = [];
tab.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
tab.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
const url = (process.env.BASE ? process.env.BASE + page : pathToFileURL(path.join(here, '..', page)).href) + '?spp=' + spp + (speed !== '' ? '&speed=' + speed : '') + (extra ? '&' + extra : '');
await tab.goto(url);
if (process.env.EARLY) { await new Promise((r) => setTimeout(r, +process.env.EARLY)); await tab.screenshot({ path: path.join(out, name + '.png') }); console.log('early'); await browser.close(); process.exit(0); }
const t0 = Date.now();
let state = {};
while (Date.now() - t0 < 600000) {
  state = await tab.evaluate(() => ({ compileMs: Math.round(window.__compileMs || 0), spp: window.__spp || 0, err: window.__err || '', adapter: window.__adapter || '', scale: window.__scale }));
  if (state.err || state.spp >= +spp) break;
  await new Promise((r) => setTimeout(r, 250));
}
await new Promise((r) => setTimeout(r, 1500));
state.showMs = await tab.evaluate(() => new Promise((res) => { let n = 0, t = performance.now(); const f = () => { if (++n < 120) requestAnimationFrame(f); else res((performance.now() - t) / 120); }; requestAnimationFrame(f); }));
// BENCH=n: the frame drawn n times over, waiting for the GPU each time: its real cost in ms
if (process.env.BENCH) state.frameMs = await tab.evaluate((n) => new Promise((res) => { window.__benchMs = 0; window.__bench = n; const w = () => window.__benchMs ? res(window.__benchMs) : requestAnimationFrame(w); w(); }), +process.env.BENCH);
state.gpu = await tab.evaluate(() => window.__gpu); state.S = await tab.evaluate(() => window.__S);
// ACT: script run in the page before the picture, e.g. ACT="UI.show('pecha');UI.pecha.go(5)"; VIEW=WxH sets the window
if (process.env.ACT) { state.act = await tab.evaluate(async (s) => { try { return String(await eval(s)); } catch (e) { return 'error: ' + e.message; } }, process.env.ACT); await new Promise((r) => setTimeout(r, +(process.env.ACTWAIT || 1200))); }
if (process.env.AUDIO) { await tab.keyboard.press('ArrowUp'); await new Promise((r) => setTimeout(r, 2500)); state.audio = await tab.evaluate(() => window.__audio ? { src: window.__audio.currentSrc.split('/').slice(-3).join('/'), t: window.__audio.currentTime, paused: window.__audio.paused, err: window.__audio.error && window.__audio.error.message } : 'none'); }
await tab.screenshot({ path: path.join(out, name + '.png') });
console.log(JSON.stringify({ ...state, secs: (Date.now() - t0) / 1000 }));
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
