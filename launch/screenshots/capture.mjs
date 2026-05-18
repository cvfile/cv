import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = (name) => join(here, name);

const VIEWPORT = { width: 1440, height: 900 };
const DEVICE_SCALE_FACTOR = 2;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  colorScheme: 'dark',
});

async function shot(name, url, prepare) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  if (prepare) await prepare(page);
  await page.screenshot({ path: out(name), fullPage: false });
  console.log('captured', name);
  await page.close();
}

// 1. hero
await shot('01-hero.png', 'https://cvfile.org/');

// 2. /view/ with sample loaded
await shot('02-view-markdown.png', 'https://cvfile.org/view/', async (page) => {
  await page.click('#load-sample');
  await page.waitForFunction(
    () => {
      const v = document.getElementById('viewer');
      return v && getComputedStyle(v).display !== 'none';
    },
    { timeout: 20000 },
  );
  // Click the Markdown tab inside the shadow DOM.
  await page.waitForFunction(
    () => {
      const v = document.getElementById('viewer');
      if (!v || !v.shadowRoot) return false;
      const tabs = [...v.shadowRoot.querySelectorAll('button, [role="tab"]')];
      const md = tabs.find((b) => b.textContent.trim() === 'Markdown');
      if (!md) return false;
      md.click();
      return true;
    },
    { timeout: 15000 },
  );
  await page.waitForTimeout(800);
});

// 3. /create/ empty drop state
await shot('03-create-empty.png', 'https://cvfile.org/create/');

// 4. /install/ code snippets (scroll JS+Py block into view)
await shot('04-install-code.png', 'https://cvfile.org/install/', async (page) => {
  const target = page.locator('h2', { hasText: 'JavaScript' }).first();
  await target.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
});

// 5. comparison table on the landing page
await shot('05-comparison.png', 'https://cvfile.org/', async (page) => {
  const heading = page.locator('h2,h3', { hasText: /existing|different|compar/i }).first();
  if (await heading.count()) {
    await heading.scrollIntoViewIfNeeded();
  } else {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.55));
  }
  await page.waitForTimeout(400);
});

await browser.close();
console.log('done');
