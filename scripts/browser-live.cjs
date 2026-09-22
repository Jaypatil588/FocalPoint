const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://localhost:5173');
    const firstResponse = page.waitForResponse(response => response.url().endsWith('/chat') && response.request().method() === 'POST', { timeout: 60000 });
    const input = page.getByRole('textbox');
    await input.fill('Explain recursion with a short example.');
    await input.press('Enter');
    const network = await firstResponse;
    assert.equal(network.status(), 200);
    const first = await network.json();
    const request = network.request().postDataJSON();
    await page.locator(`#response-${first.response_id}`).waitFor();
    const zones = await page.locator(`#response-${first.response_id} [data-zone]`).evaluateAll(elements => elements.map(element => element.dataset.zone));
    assert.ok(zones.length);
    const second = await page.evaluate(async ({ request, first, zones }) => {
      const response = await fetch('http://localhost:8000/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: request.user_id, session_id: request.session_id,
          request_id: crypto.randomUUID(), message: 'Explain a base case more simply.', previous_response_id: first.response_id,
          gaze_events: [{ zone: zones[0], visits: 4, flag: 'confusion' }] }) });
      return { status: response.status, body: await response.json() };
    }, { request, first, zones });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.ok(second.body.reward < 0);
    await page.reload();
    await page.locator('.sidebar-btn').filter({ hasText: 'Explain recursion with a short example.' }).first().click();
    await page.locator(`#response-${second.body.response_id}`).waitFor();
    await page.getByRole('button', { name: 'Inspect runs and policies' }).click();
    await page.getByRole('button', { name: /^chat completed/ }).first().click();
    await page.getByRole('region', { name: 'Selected result' }).waitFor();
    await page.screenshot({ path: '.runtime/live-browser-desktop.png', fullPage: true });
    const detail = await page.getByRole('region', { name: 'Selected result' }).innerText();
    assert.ok(detail.includes('groq') && detail.includes('context.build'));
    assert.deepEqual(errors, []);
    const report = { status: 'passed', session_id: request.session_id,
      first_run: first.trace.run_id, second_run: second.body.trace.run_id,
      synthetic_gaze_zone: zones[0], restored_response_id: second.body.response_id, browser_errors: errors };
    await fs.writeFile('.runtime/live-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
