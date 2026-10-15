const { chromium } = require('playwright');
const fs = require('fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let attempts = 0, saved;
  await page.route('http://motif.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/products/admin/list') return route.fulfill({ json: [] });
    if (path === '/api/uploads/images') {
      assert.equal(route.request().headers()['x-admin-token'], 'test'); attempts++;
      return route.fulfill(attempts === 2 ? { status: 502, json: { error: 'خطای آزمایشی' } } : { status: 201, json: { url: `https://images.test/${attempts}.webp` } });
    }
    if (path === '/api/products') { saved = route.request().postDataJSON(); return route.fulfill({ status: 400, json: { error: 'stop after capturing payload' } }); }
    const file = path === '/admin.html' ? 'public/admin.html' : 'public' + path;
    return route.fulfill({ contentType: path.endsWith('.js') ? 'application/javascript' : 'text/html', body: fs.readFileSync(file) });
  });
  try {
    await page.goto('http://motif.test/admin.html');
    await page.locator('#token').fill('test'); await page.locator('#loginForm button').click();
    await page.locator('#newProduct').click();
    const file = name => ({ name, mimeType: 'image/jpeg', buffer: Buffer.from('mock upload') });
    await page.locator('#productFields input[type=file]').setInputFiles([file('front.jpg'), file('back.jpg'), file('label.jpg')]);
    await page.waitForFunction(() => !document.querySelector('#save').disabled);
    const images = page.locator('#productFields [data-key=images]');
    assert.equal(await images.inputValue(), 'https://images.test/1.webp\nhttps://images.test/3.webp');
    assert.match(await page.locator('#productFields .image-editor [role=status]').textContent(), /back.jpg/);
    await page.getByRole('button', { name: 'انتخاب به‌عنوان اصلی' }).click();
    assert.equal(await images.inputValue(), 'https://images.test/3.webp\nhttps://images.test/1.webp');
    await page.locator('#variants input[type=file]').setInputFiles(file('size.jpg'));
    await page.waitForFunction(() => !document.querySelector('#save').disabled);
    for (const [key, value] of [['title', 'کاپشن'], ['size', 'L'], ['color', 'سبز'], ['sku', 'photo-test']]) await page.locator(`[data-key=${key}]`).fill(value);
    await page.locator('#save').click();
    await page.waitForFunction(() => document.querySelector('#message').textContent.includes('capturing'));
    assert.deepEqual(saved.images, ['https://images.test/3.webp', 'https://images.test/1.webp']);
    assert.deepEqual(saved.variants[0].itemImages, ['https://images.test/4.webp']);
    await page.screenshot({ path: '/tmp/motif-upload-mobile.png', fullPage: true });
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
