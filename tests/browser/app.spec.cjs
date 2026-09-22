const { test, expect } = require('@playwright/test');

test('UI-01/02/03/04: chat, error recovery, reload and inspector', async ({ page }, info) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  let sessions = [];
  let calls = 0;
  let failed = false;
  const payloads = [];
  await page.route('http://localhost:8000/**', async route => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data;
    let status = 200;
    if (path === '/profile') data = { complexity_score: 5, preferred_format: 'prose' };
    else if (path === '/sessions') data = sessions;
    else if (path.startsWith('/sessions/') && route.request().method() === 'DELETE') { sessions = []; data = { deleted: true }; }
    else if (path === '/chat') {
      const body = route.request().postDataJSON();
      payloads.push(body);
      if (failed) { status = 502; data = { detail: 'Explicit provider test failure' }; }
      else {
        calls++;
        const text = `Response ${calls}: Recursion solves a smaller problem and stops at a base case.`;
        const responseId = `r${calls}`;
        const messages = sessions.length ? sessions[0].messages : [];
        messages.push({ role: 'user', text: body.message, message_id: `u${calls}` },
          { role: 'assistant', text, responseId, message_id: responseId, system_prompt: 'Test policy prompt.' });
        sessions = [{ id: body.session_id, title: 'Explain recursion', messages }];
        data = { response_id: responseId, text, reward: null, user_profile: { complexity_score: 5, preferred_format: 'prose' },
          system_prompt: 'Test policy prompt.', policy_id: 'fixture-policy', trace: { run_id: 'demo_user:fixture', trace_id: 'trace-fixture' } };
      }
    } else if (path === '/inspect/runs') data = [{ run_id: 'demo_user:fixture', run_type: 'chat', status: 'completed', started_at: new Date().toISOString() }];
    else if (path.startsWith('/inspect/runs/')) data = { status: 'completed', spans: [{ name: 'context.build', output: { token_budget: 8000 } }] };
    else if (path === '/inspect/memory') data = { working: [], episodic: [], semantic: [], procedural: { policy_id: 'fixture-policy' } };
    else if (path === '/inspect/policies') data = { active_policy_id: 'fixture-policy', policies: [{ policy_id: 'fixture-policy', rationale: 'Baseline fixture.' }] };
    else if (path.endsWith('/regression')) data = { passed: true, score: 1, checks: [{ id: 'fixture', passed: true }] };
    else if (path === '/inspect/evaluations') data = [];
    else if (path === '/session/end') data = { promoted: false, rationale: 'Fixture candidate rejected.',
      gate: { passed: false, reasons: ['minimum gain not reached'] }, trace: { run_id: 'improvement-fixture' } };
    else { status = 404; data = { detail: 'Unexpected test route' }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('/');
  const input = page.getByRole('textbox');
  await input.fill('Explain recursion'); await input.press('Enter');
  await expect(page.locator('#response-r1')).toBeVisible();
  await input.fill('Show a base case'); await input.press('Enter');
  await expect(page.locator('#response-r2')).toBeVisible();
  expect(payloads[1].history).toBeUndefined();
  expect(payloads[1].gaze_events).toEqual([]);
  expect(payloads[1].previous_response_id).toBe('r1');
  failed = true;
  await input.fill('Try a failure'); await input.press('Enter');
  await expect(input).toHaveValue('Try a failure');
  await expect(page.getByText('Backend error:', { exact: false })).toBeVisible();
  expect(sessions[0].messages).toHaveLength(4);
  failed = false;
  await input.press('Enter');
  await expect(page.locator('#response-r3')).toBeVisible();
  await expect(page.getByText('Backend error:', { exact: false })).not.toBeVisible();
  expect(payloads[2].request_id).not.toBe(payloads[3].request_id);
  await page.getByRole('button', { name: 'Inspect runs and policies' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /chat completed/ }).click();
  await expect(page.getByRole('region', { name: 'Selected result' })).toContainText('context.build');
  await page.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(page.locator('summary').filter({ hasText: 'semantic' })).toBeVisible();
  await page.getByRole('button', { name: 'Policies', exact: true }).click();
  await page.getByRole('button', { name: 'Run Regression' }).click();
  await expect(page.getByRole('region', { name: 'Selected result' })).toContainText('"passed": true');
  await page.getByRole('button', { name: 'Improve Current Session' }).click();
  await expect(page.getByRole('region', { name: 'Selected result' })).toContainText('"promoted": false');
  await expect(page.getByRole('region', { name: 'Selected result' })).toContainText('minimum gain not reached');
  await page.screenshot({ path: `.runtime/inspector-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.screenshot({ path: `.runtime/chat-${info.project.name}.png`, fullPage: true });
  await page.reload();
  if (info.project.name === 'mobile') await page.locator('.topbar .icon-btn').first().click();
  await page.locator('.sidebar-btn').filter({ hasText: 'Explain recursion' }).click();
  await expect(page.locator('#response-r3')).toBeVisible();
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await expect(page.locator('#response-r3')).not.toBeVisible();
  await page.locator('.sidebar-btn').filter({ hasText: 'Explain recursion' }).click();
  await expect(page.locator('#response-r3')).toBeVisible();
  await page.getByRole('button', { name: 'Delete Explain recursion' }).click();
  await expect(page.locator('#response-r2')).not.toBeVisible();
  expect(sessions).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('UI-02: inspector loading, empty, failure and explicit refresh', async ({ page }) => {
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  let fail = true;
  await page.route('http://localhost:8000/inspect/runs?*', async route => {
    await hold;
    await route.fulfill({ contentType: 'application/json', body: '[]' });
  });
  await page.route('http://localhost:8000/inspect/evaluations?*', route => route.fulfill({
    status: fail ? 503 : 200, contentType: 'application/json',
    body: JSON.stringify(fail ? { detail: 'Inspection database unavailable' } : []),
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Inspect runs and policies' }).click();
  await expect(page.getByRole('status')).toHaveText('Running...');
  await expect(page.getByRole('button', { name: 'Refresh inspector' })).toBeDisabled();
  release();
  await expect(page.getByText('No runs recorded.')).toBeVisible();
  await page.getByRole('button', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Inspection database unavailable');
  fail = false;
  await page.getByRole('button', { name: 'Refresh inspector' }).click();
  await expect(page.getByText('No evaluations recorded.')).toBeVisible();
  await expect(page.getByRole('alert')).not.toBeVisible();
});

test('GAZE-08: denied camera is an explicit error', async ({ page }, info) => {
  test.skip(info.project.name === 'mobile', 'Camera panel is available on desktop; physical tracking is not claimed here.');
  await page.addInitScript(() => {
    localStorage.clear();
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Camera denied by test', 'NotAllowedError'); };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Calibrate Iris Tracker', exact: true }).click();
  await expect(page.getByText('Camera denied by test')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Calibrate Iris Tracking' })).not.toBeVisible();
  await expect(page.locator('.badge-off')).toContainText('OFF');
});

test('GAZE-01/02: response scoped synthetic gaze classification', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { computeGazeEvents } = await import('/src/utils/gazeUtils.js');
    const zones = ['r1:line_0', 'r1:line_1', 'r1:line_2', 'r1:line_3'];
    const log = { 'r1:line_1': [1], 'r1:line_2': [1, 2], 'r1:line_3': [1, 2, 3, 4], 'old:line_0': [1] };
    return { flags: computeGazeEvents(zones, log).map(e => e.flag),
      noTracking: computeGazeEvents(zones, log, false), noFixations: computeGazeEvents(zones, {}) };
  });
  expect(result.flags).toEqual(['skipped', 'skim', 'smooth', 'confusion']);
  expect(result.noTracking).toEqual([]);
  expect(result.noFixations).toEqual([]);
});
