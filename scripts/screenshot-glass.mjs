import { chromium } from 'playwright-core';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'screenshots');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 1100 } });

page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('[MagnifyingGlass]') || t.includes('REAL VALUES')) console.log('BROWSER:', t);
});

// ── Magnifier at distortion 1.6 ──────────────────────────────────────────────
await page.goto('http://127.0.0.1:5175/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);

const sliders = page.locator('input[type="range"]');
await sliders.nth(2).evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter.call(el, '1.6');
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForTimeout(800);

const sliderInfo = await sliders.nth(2).evaluate((el) => ({
  value: el.value,
  label: el.parentElement?.innerText?.slice(0, 80),
}));
console.log('slider', sliderInfo);

await page.evaluate(() => {
  const lens = document.querySelector('.magnifying-glass-lens');
  const img = document.querySelector('img[alt="Frog Lens Target"]');
  if (!lens || !img) return;
  const r = img.getBoundingClientRect();
  lens.style.left = `${r.left + r.width * 0.52}px`;
  lens.style.top = `${r.top + r.height * 0.48}px`;
});

await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, 'lupa-distortion-1.6.png') });

// ── Normal LiquidGlass (Test Lab) ────────────────────────────────────────────
await page.setViewportSize({ width: 1400, height: 1800 });
await page.goto('http://127.0.0.1:5175/?lab=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
const glass = page.getByTestId('liquid-glass-lab-panel');
await glass.scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await glass.screenshot({ path: join(outDir, 'glass-normal-testlab.png') });

await browser.close();
console.log('Wrote screenshots to', outDir);
