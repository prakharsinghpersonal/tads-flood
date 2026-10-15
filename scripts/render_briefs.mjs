import { chromium } from '../apps/web/node_modules/playwright/index.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const input = resolve(process.argv[2] ?? 'artifacts/case-study-syapru');
const output = resolve('output/pdf');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}),
  headless: true,
});
try {
  for (const lang of ['en', 'ne']) {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(input, 'brief-' + lang + '.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const path = resolve(output, lang === 'en' ? 'TADS_Flood_Situation_Brief_EN.pdf' : 'TADS_Flood_Situation_Brief_NE_Draft.pdf');
    await page.pdf({ path, format: 'A4', printBackground: true });
    await page.close();
    console.log(path);
  }
} finally { await browser.close(); }
