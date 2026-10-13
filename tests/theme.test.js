/** Exercise the real early theme script in isolated browser documents. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const source = readFileSync('public/theme.js', 'utf8');

/** Load the actual script before the select exists, then expose the page control. */
function page(saved, failure) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost', runScripts: 'outside-only' });
  const window = dom.window;
  if (saved !== undefined) window.localStorage.setItem('devnotes_theme', saved);
  if (failure === 'get') window.Storage.prototype.getItem = () => { throw new Error('blocked read'); };
  if (failure === 'set') window.Storage.prototype.setItem = () => { throw new Error('blocked write'); };
  if (failure === 'access') Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked storage'); } });
  window.eval(source);
  assert.equal(window.document.documentElement.dataset.theme, saved === 'dark' && !['get', 'access'].includes(failure) ? 'dark' : 'light');
  window.document.body.innerHTML = '<label for="appearance">Appearance</label><select id="appearance"><option value="light">Light</option><option value="dark">Dark</option></select>';
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return dom;
}

for (const saved of [undefined, 'light', 'dark', 'Dark', '', 'system', '{broken}']) {
  test(`early theme and control use ${JSON.stringify(saved)} preference correctly`, () => {
    const dom = page(saved);
    try {
      const expected = saved === 'dark' ? 'dark' : 'light';
      assert.equal(dom.window.document.getElementById('appearance').value, expected);
      assert.equal(dom.window.document.documentElement.style.colorScheme, expected);
    } finally { dom.window.close(); }
  });
}

test('changes persist both appearances and reload reads the chosen preference', () => {
  const dom = page();
  try {
    const { window } = dom;
    const select = window.document.getElementById('appearance');
    for (const choice of ['dark', 'light', 'dark']) {
      select.value = choice;
      select.dispatchEvent(new window.Event('change'));
      assert.equal(window.document.documentElement.dataset.theme, choice);
      assert.equal(window.document.documentElement.style.colorScheme, choice);
      assert.equal(window.localStorage.getItem('devnotes_theme'), choice);
      const reloaded = page(window.localStorage.getItem('devnotes_theme'));
      assert.equal(reloaded.window.document.getElementById('appearance').value, choice);
      reloaded.window.close();
    }
  } finally { dom.window.close(); }
});

for (const failure of ['get', 'set', 'access']) {
  test(`${failure} storage failure preserves current-page Light/Dark switching`, () => {
    const dom = page('dark', failure);
    try {
      const select = dom.window.document.getElementById('appearance');
      for (const choice of ['dark', 'light', 'dark']) {
        select.value = choice;
        select.dispatchEvent(new dom.window.Event('change'));
        assert.equal(dom.window.document.documentElement.dataset.theme, choice);
        assert.equal(dom.window.document.documentElement.style.colorScheme, choice);
        assert.equal(select.value, choice);
      }
      if (failure === 'set') assert.equal(dom.window.localStorage.getItem('devnotes_theme'), 'dark');
    } finally { dom.window.close(); }
  });
}

test('invalid control choice normalizes to Light instead of an unknown theme', () => {
  const dom = page('dark');
  try {
    const select = dom.window.document.getElementById('appearance');
    select.value = 'invalid';
    select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(select.value, 'light');
    assert.equal(dom.window.document.documentElement.dataset.theme, 'light');
    assert.equal(dom.window.localStorage.getItem('devnotes_theme'), 'light');
  } finally { dom.window.close(); }
});
