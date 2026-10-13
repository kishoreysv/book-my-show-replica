/** Parent-owned real-browser verification; browser demo stories intentionally do not call APIs. */
const { test, expect } = require('@playwright/test');

/** Record browser failures and unexpected API traffic before the first navigation. */
function observe(page) {
  const errors = [];
  const apiRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
  return { errors, apiRequests };
}

/** Attach actual local screenshots, accessibility structure, computed roles and rendered HTML. */
async function evidence(page, info, state) {
  const path = info.outputPath(`${state}.png`);
  await page.screenshot({ path, fullPage: true });
  await info.attach(`${state}-screenshot`, { path, contentType: 'image/png' });
  await info.attach(`${state}-aria`, { body: await page.locator('body').ariaSnapshot(), contentType: 'text/plain' });
  await info.attach(`${state}-html`, { body: await page.content(), contentType: 'text/html' });
  const styles = await page.evaluate(() => {
    const selectors = ['body', '.navbar', 'h1', '.post-card', '.post-card p', '#appearance', '.modal', 'input', 'textarea'];
    return Object.fromEntries(selectors.map(selector => {
      const style = getComputedStyle(document.querySelector(selector));
      return [selector, { color: style.color, background: style.backgroundColor, font: style.fontFamily, fontSize: style.fontSize, lineHeight: style.lineHeight, padding: style.padding, maxWidth: style.maxWidth, radius: style.borderRadius, outline: style.outline, colorScheme: style.colorScheme }];
    }));
  });
  await info.attach(`${state}-styles`, { body: JSON.stringify(styles, null, 2), contentType: 'application/json' });
}

/** Verify representative AA text roles on their actual computed surface backgrounds. */
async function readable(page) {
  const ratios = await page.evaluate(() => {
    function rgb(value) { return value.match(/[\d.]+/g).slice(0, 3).map(Number); }
    function luminance(color) {
      return rgb(color).map(value => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    }
    return ['body', '.hero p', '.post-meta', '.post-card p', '.appearance-control label', '#appearance', '.btn-secondary', '.modal-sub', '#username', '.btn-primary', '.field-error'].map(selector => {
      const element = document.querySelector(selector);
      const style = getComputedStyle(element);
      let parent = element;
      while (getComputedStyle(parent).backgroundColor === 'rgba(0, 0, 0, 0)') parent = parent.parentElement;
      const foreground = luminance(style.color);
      const background = luminance(getComputedStyle(parent).backgroundColor);
      return { selector, ratio: (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05) };
    });
  });
  for (const { selector, ratio } of ratios) expect(ratio, `${selector} contrast`).toBeGreaterThanOrEqual(4.5);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

for (const theme of ['light', 'dark']) {
  test(`${theme}: keyboard preference, full demo journey, errors, focus and preflight`, async ({ page }, info) => {
    const observed = observe(page);
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByLabel('Appearance')).toHaveValue('light');
    await evidence(page, info, `${theme}-before-journey`); // Refreshed initial state; parent captures original baseline separately.
    const appearance = page.getByLabel('Appearance');
    await appearance.focus();
    expect(await appearance.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('solid');
    expect(await appearance.evaluate(element => parseFloat(getComputedStyle(element).outlineWidth))).toBeGreaterThanOrEqual(3);
    await page.keyboard.press(theme === 'dark' ? 'ArrowDown' : 'ArrowUp');
    await page.keyboard.press('Tab');
    await expect(appearance).toHaveValue(theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    if (theme === 'light') {
      // Prove explicit Light persistence rather than merely accepting a default.
      await appearance.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
      await appearance.focus(); await page.keyboard.press('ArrowUp'); await page.keyboard.press('Tab');
    }
    expect(await page.evaluate(() => localStorage.getItem('devnotes_theme'))).toBe(theme);
    await page.reload();
    await expect(appearance).toHaveValue(theme);
    await page.getByRole('link', { name: 'DevNotes', exact: true }).click();
    await expect(appearance).toHaveValue(theme);
    await expect(page.locator('.post-card')).toHaveCount(2);
    await readable(page);
    const signIn = page.getByRole('button', { name: 'Sign In', exact: true });
    await signIn.click();
    const dialog = page.getByRole('dialog', { name: 'Sign In to DevNotes' });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.getByRole('button', { name: 'Close sign-in dialog' }).focus();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Sign In', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Close sign-in dialog' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden(); await expect(signIn).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await signIn.click();
    await page.locator('#auth-modal').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeHidden(); await expect(signIn).toBeFocused();
    await signIn.click();
    await page.getByLabel('Username', { exact: true }).fill('   ');
    await page.getByLabel('Password', { exact: true }).fill('demo');
    await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.locator('#username-error')).toHaveText('Enter a username, not only spaces.');
    await expect(page.getByLabel('Username', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await evidence(page, info, `${theme}-dialog-error`);
    await readable(page);
    await page.getByLabel('Username', { exact: true }).fill('builder');
    await expect(page.locator('#username-error')).toBeEmpty();
    await dialog.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeFocused();
    await expect(page.locator('#user-greeting')).toHaveText('Signed in as @builder');
    await page.getByLabel('Article Title').fill('   ');
    await page.getByLabel('Story Body').fill('   ');
    await page.getByRole('button', { name: 'Publish Story' }).click();
    await expect(page.locator('#post-title-error')).toContainText('Enter an article title');
    await expect(page.locator('#post-content-error')).toContainText('Enter a story body');
    await expect(page.getByLabel('Article Title')).toBeFocused();
    await expect(page.locator('.post-card')).toHaveCount(2);
    await page.getByLabel('Article Title').fill('<b>Browser story</b>');
    await page.getByLabel('Story Body').fill('<img src=x onerror=bad()>\nA second line.');
    await page.getByRole('button', { name: 'Publish Story' }).click();
    const story = page.locator('.post-card').first();
    await expect(story.locator('h3')).toHaveText('<b>Browser story</b>');
    await expect(story.locator('p')).toHaveText('<img src=x onerror=bad()>\nA second line.');
    await expect(story.locator('strong')).toHaveText('@builder');
    await expect(story.locator('img, b, script')).toHaveCount(0);
    await expect(page.getByLabel('Article Title')).toHaveValue('');
    await expect(page.getByLabel('Story Body')).toHaveValue('');
    await expect(page.locator('.post-card')).toHaveCount(3);
    await evidence(page, info, `${theme}-after-publish`);
    await readable(page);
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await expect(page.locator('#create-post-section')).toBeHidden();
    await expect(page.locator('.post-card')).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem('devnotes_user'))).toBeNull();
    await evidence(page, info, `${theme}-after-signout`);
    await page.reload(); // Publishing remains intentionally transient.
    await expect(page.locator('.post-card')).toHaveCount(2);
    await expect(appearance).toHaveValue(theme);
    expect(observed.apiRequests).toEqual([]);
    expect(observed.errors).toEqual([]);
  });
}

test('invalid saved preferences and sessions fall back without blocking the page', async ({ page }, info) => {
  const observed = observe(page);
  await page.addInitScript(() => {
    localStorage.setItem('devnotes_theme', 'invalid');
    localStorage.setItem('devnotes_user', '{invalid');
  });
  await page.goto('/');
  await expect(page.getByLabel('Appearance')).toHaveValue('light');
  await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  await expect(page.locator('.post-card')).toHaveCount(2);
  await page.getByLabel('Appearance').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('devnotes_theme'))).toBe('dark');
  await evidence(page, info, 'invalid-storage-recovered');
  await readable(page);
  expect(observed.errors).toEqual([]); expect(observed.apiRequests).toEqual([]);
});

for (const failure of ['get', 'set', 'remove', 'access']) {
  test(`${failure} storage unavailable: both themes and demo actions stay usable`, async ({ page }, info) => {
    const observed = observe(page);
    await page.addInitScript(kind => {
      if (kind === 'access') Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage disabled'); } });
      else Storage.prototype[`${kind}Item`] = () => { throw new Error('Storage disabled'); };
    }, failure);
    await page.goto('/');
    await expect(page.getByLabel('Appearance')).toHaveValue('light');
    for (const theme of ['dark', 'light']) {
      await page.getByLabel('Appearance').selectOption(theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      expect(await page.evaluate(() => document.documentElement.style.colorScheme)).toBe(theme);
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await page.getByLabel('Username', { exact: true }).fill(`offline-${theme}`);
      await page.getByLabel('Password', { exact: true }).fill('demo');
      await page.getByRole('dialog').getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page.locator('#user-greeting')).toHaveText(`Signed in as @offline-${theme}`);
      await page.getByLabel('Article Title').fill(`Offline ${theme}`);
      await page.getByLabel('Story Body').fill('Current-page demo story.');
      await page.getByRole('button', { name: 'Publish Story' }).click();
      await expect(page.locator('.post-card').first().locator('h3')).toHaveText(`Offline ${theme}`);
      await expect(page.locator('.post-card').first().locator('strong')).toHaveText(`@offline-${theme}`);
      await page.getByRole('button', { name: 'Sign Out' }).click();
      await expect(page.locator('#create-post-section')).toBeHidden();
      await expect(page.getByLabel('Appearance')).toHaveValue(theme);
      await readable(page);
      await evidence(page, info, `${failure}-${theme}-session`);
    }
    expect(observed.errors).toEqual([]); expect(observed.apiRequests).toEqual([]);
  });
}
