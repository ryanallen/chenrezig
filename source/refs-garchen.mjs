// Fetches the deity images used as references for the wall paintings from garchen.net (the Garchen Buddhist
// Institute, whose teaching the temple is made for) into ../references/garchen/, with SOURCES.md listing them.
// The deities are the ones the Chenrezig empowerment names (dharma/chenrezig-empowerment-2020/chenrezig-empowerment.md).
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'references', 'garchen');
mkdirSync(out, { recursive: true });
const U = 'https://garchen.net/wp-content/uploads/';
const LIST = [
  ['thousand-armed-chenrezig-1', '2026/05/1000arms_eyes_chenrezig_mani_kabum-scaled.jpg', 'Thousand-armed Chenrezig (Mani Kabum)'],
  ['thousand-armed-chenrezig-2', '2023/05/20220703_Chenrezig_RoyalTradition_1000arms_scan600dpi-2-WEB.jpg', 'Thousand-armed Chenrezig, royal tradition'],
  ['thousand-armed-chenrezig-3', '2020/04/Thousand-armed-Avalokiteshvara-FINAL-900.png', 'Thousand-armed Avalokiteshvara'],
  ['four-armed-chenrezig-1', '2018/04/Avalokitesvara-Tibetan-Thangka-e1525029168499.jpg', 'Four-armed Avalokiteshvara thangka'],
  ['red-chenrezig', '2023/01/20230302_RedChenrezig-scaled.jpg', 'Red Chenrezig'],
  ['amitabha', '2022/09/20221020-23_AmitabhaRetreat.png', 'Amitabha'],
  ['samantabhadra-1', '2020/06/BuddhaSamantabhadra-900.png', 'Buddha Samantabhadra'],
  ['samantabhadra-2', '2020/06/Samantabhadra_tapestry_900.png', 'Samantabhadra tapestry'],
  ['shakyamuni-1', '2020/04/Buddha-Shakyamuni-900.jpg', 'Buddha Shakyamuni'],
  ['shakyamuni-2', '2020/06/Shakyamuni-lion-throne1-900.png', 'Shakyamuni on the lion throne'],
  ['vajrakilaya-1', '2024/09/Vajrakilaya-Wisdom-Being.jpg', 'Vajrakilaya'],
  ['vajrakilaya-2', '2023/07/2023-Vajrakilaya.jpg', 'Vajrakilaya'],
  ['tara-1', '2024/11/tara.jpg', 'Tara'],
  ['21-taras', '2022/12/21Taras.jpeg', 'The 21 Taras'],
  ['white-tara', '2021/03/image.png', 'White Tara'],
  ['gampopa', '2021/01/GRHevajraGampopa.jpg', 'Gampopa'],
  ['jigten-sumgon', '2022/12/Lord-Jigten-Sumgon-website-photo-scaled.jpg', 'Lord Jigten Sumgon'],
  ['drikung-lineage', '2020/04/Lineage-Masters-of-Drikung-Kagyu-900.jpg', 'Lineage masters of the Drikung Kagyu'],
  ['guru-rinpoche', '2020/04/Guru-Rinpoche-Clean-Final-900.png', 'Guru Rinpoche'],
  ['milarepa', '2020/06/Milarepa_Late_19th-early_20th_Century1-900.png', 'Milarepa'],
  ['medicine-buddha', '2020/04/MedicineBuddha-Thangka-FINAL-900.png', 'Medicine Buddha'],
  ['manjushri', '2020/06/Manjushri-900.png', 'Manjushri'],
  ['vajrasattva', '2020/04/Vajrasattva-FINAL-900.jpg', 'Vajrasattva'],
  ['garchen-rinpoche-prayer-wheel', '2023/05/GR-w-prayer-wheel-portrait-.jpg', 'H.E. Garchen Rinpoche with a prayer wheel'],
];
const lines = ['# Reference images from garchen.net', '', 'For Codex to paint the wall murals from. Fetched by `source/refs-garchen.mjs`.', '', '| File | Subject | Source |', '|---|---|---|'];
for (const [name, p, subject] of LIST) {
  const r = await fetch(U + p, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) { console.log('FAIL', name, r.status); continue; }
  const file = name + path.extname(p).toLowerCase().replace('.jpeg', '.jpg');
  writeFileSync(path.join(out, file), Buffer.from(await r.arrayBuffer()));
  lines.push(`| ${file} | ${subject} | ${U + p} |`);
  await new Promise((res) => setTimeout(res, 400));
}
writeFileSync(path.join(out, 'SOURCES.md'), lines.join('\n') + '\n');
console.log('saved', lines.length - 6);
