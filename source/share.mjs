// The social share image, ../share.jpg (1200 x 630): the temple rendered in headless Edge from a set view, the title laid
// over a dark band at the foot. The page's Open Graph and Twitter tags point at it. Run after build.mjs.
// node share.mjs
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: 'new',
  args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'], defaultViewport: { width: 1200, height: 630 },
});
const tab = await browser.newPage();
await tab.goto(pathToFileURL(path.join(here, '..', 'index.html')).href + '?nomenu&fastbake&mute&pitch=4&speed=0.15');
await tab.waitForFunction(() => (window.__spp || 0) >= 360, { timeout: 300000, polling: 250 });
await new Promise((r) => setTimeout(r, 800));
await tab.evaluate(() => {
  for (const id of ['h', 'd', 'v']) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }
  const o = document.createElement('div');
  o.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:0 56px 40px;z-index:9;' +
    'background:linear-gradient(to top,rgba(14,8,4,.92) 0%,rgba(14,8,4,.6) 34%,rgba(14,8,4,0) 58%);font-family:Georgia,serif;color:#f0dcb4';
  o.innerHTML = '<div style="font-family:\'Microsoft Himalaya\',\'Noto Serif Tibetan\',serif;font-size:64px;line-height:1;color:#e0b35a">ཨོཾ་མ་ཎི་པདྨེ་ཧཱུྃ</div>' +
    '<div style="font-size:50px;letter-spacing:.08em;margin-top:6px">CHENREZIG</div>' +
    '<div style="font-size:23px;margin-top:8px;color:#e8d6b8">Turn the prayer wheel, read the teaching and watch H.E. Garchen Rinpoche\'s empowerment</div>';
  document.body.append(o);
});
await new Promise((r) => setTimeout(r, 300));
await tab.screenshot({ path: path.join(here, '..', 'share.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
console.log('share.jpg written');
