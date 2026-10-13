/** Verify real browser-only demo workflows and their negative branches. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const html = readFileSync('public/index.html', 'utf8');
const source = readFileSync('public/app.js', 'utf8');

/** Initialize the actual DOM and application script with an isolated storage policy. */
function page(t, saved, failure) {
  const dom = new JSDOM(html, { url: 'http://localhost', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  if (saved !== undefined) w.localStorage.setItem('devnotes_user', saved);
  if (failure === 'access') Object.defineProperty(w, 'localStorage', { get() { throw new Error('blocked'); } });
  else if (failure) w.Storage.prototype[`${failure}Item`] = () => { throw new Error('blocked'); };
  w.fetch = () => { throw new Error('Demo workflows must not fetch APIs'); };
  require('node:vm').runInContext(source, dom.getInternalVMContext());
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  return w;
}
/** Submit the actual form event without bypassing the application handler contract. */
function submit(w, id) {
  const event = new w.Event('submit', { bubbles: true, cancelable: true });
  const handlers = { 'login-form': w.handleLogin, 'post-form': w.handleCreatePost };
  w.document.getElementById(id).addEventListener('submit', handlers[id], { once: true });
  w.document.getElementById(id).dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
}
/** Fill a real field and emit its input event. */
function fill(w, id, value) {
  const input = w.document.getElementById(id);
  input.value = value;
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
}
/** Complete the demo sign-in through the visible account button and form. */
function login(w, username = '  builder  ') {
  w.document.getElementById('auth-btn').focus();
  w.document.getElementById('auth-btn').click();
  fill(w, 'username', username);
  fill(w, 'password', 'demo');
  submit(w, 'login-form');
}

for (const saved of [undefined, 'broken json', 'null', '[]', '"builder"', '{}', '{"username":5,"role":"Author"}', '{"username":"  ","role":"Author"}', '{"username":"builder","role":"Admin"}']) {
  test(`invalid or absent session ${saved} stays signed out with original stories`, t => {
    const w = page(t, saved);
    assert.equal(w.document.getElementById('auth-btn').textContent, 'Sign In');
    assert.equal(w.document.getElementById('create-post-section').classList.contains('hidden'), true);
    assert.equal(w.document.querySelectorAll('.post-card').length, 2);
    assert.equal(w.document.querySelector('.post-card h3').textContent, 'Welcome to Our New Developer Blog');
    assert.equal(w.document.querySelectorAll('.post-card')[1].querySelector('h3').textContent, 'Mastering Modern Web Architecture');
    assert.equal(w.document.querySelector('.post-card p').textContent, 'This is our inaugural post exploring full-stack engineering, clean code architecture, and agentic workflows.');
  });
}

test('valid saved author session is trimmed and rendered safely', t => {
  const w = page(t, JSON.stringify({ username: '  <b>builder</b>  ', role: 'Author' }));
  assert.equal(w.document.getElementById('auth-btn').textContent, 'Sign Out');
  assert.equal(w.document.getElementById('create-post-section').classList.contains('hidden'), false);
  assert.equal(w.document.getElementById('user-greeting').textContent, 'Signed in as @<b>builder</b>');
  assert.equal(w.document.getElementById('user-greeting').querySelector('b'), null);
});

test('dialog traps both Tab directions, ignores interior clicks, closes and restores scroll/focus', t => {
  const w = page(t);
  const d = w.document;
  const trigger = d.getElementById('auth-btn');
  d.body.style.overflow = 'auto';
  trigger.focus(); trigger.click();
  assert.equal(d.activeElement.id, 'username');
  assert.equal(d.body.style.overflow, 'hidden');
  assert.equal(d.querySelector('main').inert, true);
  d.querySelector('.modal').click();
  assert.equal(d.getElementById('auth-modal').classList.contains('hidden'), false);
  const first = d.querySelector('.modal-close');
  const last = d.querySelector('#login-form button');
  first.focus();
  const reverse = new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true });
  d.dispatchEvent(reverse);
  assert.equal(reverse.defaultPrevented, true);
  assert.equal(d.activeElement, last);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  assert.equal(d.activeElement, first);
  d.getElementById('username').focus();
  const middle = new w.KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
  d.dispatchEvent(middle);
  assert.equal(middle.defaultPrevented, false);
  // The trap also recovers accidental focus outside the dialog.
  trigger.focus(); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  assert.equal(d.activeElement, first);
  trigger.focus(); d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, cancelable: true }));
  assert.equal(d.activeElement, last);
  d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  assert.equal(d.getElementById('auth-modal').classList.contains('hidden'), true);
  assert.equal(d.activeElement, trigger);
  assert.equal(d.body.style.overflow, 'auto');
  assert.equal(d.querySelector('main').inert, false);
  w.closeAuthModal();
  assert.equal(d.body.style.overflow, 'auto');
  const closedTab = new w.KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
  d.dispatchEvent(closedTab); assert.equal(closedTab.defaultPrevented, false);
  trigger.click(); d.getElementById('auth-modal').click();
  assert.equal(d.activeElement, trigger);
  assert.equal(d.getElementById('auth-modal').classList.contains('hidden'), true);
  trigger.click(); w.toggleAuthModal();
  assert.equal(d.activeElement, trigger);
  trigger.click(); first.addEventListener('click', w.toggleAuthModal, { once: true }); first.click();
  assert.equal(d.getElementById('auth-modal').classList.contains('hidden'), true);
});

for (const username of ['', '  \n ']) {
  test(`empty username ${JSON.stringify(username)} exposes inline error without login`, t => {
    const w = page(t);
    login(w, username);
    const d = w.document;
    assert.equal(d.getElementById('auth-btn').textContent, 'Sign In');
    assert.equal(d.getElementById('username').getAttribute('aria-invalid'), 'true');
    assert.equal(d.getElementById('username').getAttribute('aria-describedby'), 'username-error');
    assert.equal(d.getElementById('username-error').getAttribute('role'), 'alert');
    assert.match(d.getElementById('username-error').textContent, /Enter a username/);
    assert.equal(d.activeElement.id, 'username');
    assert.equal(w.localStorage.getItem('devnotes_user'), null);
    fill(w, 'username', 'builder');
    assert.equal(d.getElementById('username-error').textContent, '');
    assert.equal(d.getElementById('username').getAttribute('aria-invalid'), 'false');
  });
}

for (const failure of [undefined, 'get', 'set', 'remove', 'access']) {
  test(`login, safe publishing, reset/order and sign-out work with ${failure || 'normal'} storage`, t => {
    const w = page(t, undefined, failure);
    const d = w.document;
    login(w, ' <img src=x onerror=alert(1)> ');
    assert.equal(d.getElementById('auth-btn').textContent, 'Sign Out');
    assert.equal(d.getElementById('auth-modal').classList.contains('hidden'), true);
    assert.equal(d.activeElement.id, 'auth-btn');
    assert.equal(d.getElementById('username').value, '');
    if (!failure || failure === 'remove') assert.deepEqual(JSON.parse(w.localStorage.getItem('devnotes_user')), { username: '<img src=x onerror=alert(1)>', role: 'Author' });
    fill(w, 'post-title', ' <script>bad()</script> ');
    fill(w, 'post-content', ' <img src=x onerror=bad()>\nSecond line ');
    submit(w, 'post-form');
    assert.equal(d.querySelectorAll('.post-card').length, 3);
    const article = d.querySelector('.post-card');
    assert.equal(article.querySelector('h3').textContent, '<script>bad()</script>');
    assert.equal(article.querySelector('p').textContent, '<img src=x onerror=bad()>\nSecond line');
    assert.equal(article.querySelector('strong').textContent, '@<img src=x onerror=alert(1)>');
    assert.equal(article.querySelectorAll('img,script').length, 0);
    assert.match(article.querySelector('.post-meta').textContent, / on .+/);
    assert.equal(d.getElementById('post-title').value, '');
    assert.equal(d.getElementById('post-content').value, '');
    assert.equal(d.getElementById('workflow-status').textContent, 'Story published.');
    fill(w, 'post-title', 'Second'); fill(w, 'post-content', 'Body'); submit(w, 'post-form');
    assert.equal(d.querySelector('.post-card h3').textContent, 'Second');
    assert.equal(d.querySelectorAll('.post-card')[1].querySelector('h3').textContent, '<script>bad()</script>');
    d.getElementById('auth-btn').click();
    assert.equal(d.getElementById('auth-btn').textContent, 'Sign In');
    assert.equal(d.getElementById('user-greeting').textContent, '');
    assert.equal(d.getElementById('create-post-section').classList.contains('hidden'), true);
    assert.equal(d.querySelectorAll('.post-card').length, 4);
    if (!failure || failure === 'set') assert.equal(w.localStorage.getItem('devnotes_user'), null);
    if (failure === 'remove') assert.notEqual(w.localStorage.getItem('devnotes_user'), null);
    d.getElementById('auth-btn').click();
    assert.equal(d.activeElement.id, 'username');
  });
}

for (const [title, body, invalid] of [['', 'Body', 'post-title'], ['  ', 'Body', 'post-title'], ['Title', '', 'post-content'], ['Title', ' \n ', 'post-content'], [' ', ' ', 'post-title']]) {
  test(`invalid story ${JSON.stringify([title, body])} leaves feed/form intact and focuses error`, t => {
    const w = page(t); login(w);
    fill(w, 'post-title', title); fill(w, 'post-content', body); submit(w, 'post-form');
    assert.equal(w.document.querySelectorAll('.post-card').length, 2);
    assert.equal(w.document.activeElement.id, invalid);
    assert.equal(w.document.getElementById(invalid).getAttribute('aria-invalid'), 'true');
    assert.match(w.document.getElementById(`${invalid}-error`).textContent, /Enter/);
    assert.equal(w.document.getElementById('post-title').value, title);
    fill(w, invalid, 'valid');
    assert.equal(w.document.getElementById(`${invalid}-error`).textContent, '');
  });
}

test('native required fields remain present; empty feed and anonymous fallback remain safe', t => {
  const w = page(t);
  for (const id of ['username', 'password', 'post-title', 'post-content']) {
    assert.equal(w.document.getElementById(id).required, true);
    assert.equal(w.document.getElementById(id).getAttribute('aria-required'), 'true');
  }
  w.eval('posts = []'); w.renderPosts();
  assert.equal(w.document.querySelectorAll('.post-card').length, 0);
  assert.equal(w.document.getElementById('posts-container').textContent, 'No stories yet.');
  fill(w, 'post-title', 'Demo'); fill(w, 'post-content', 'Body'); submit(w, 'post-form');
  assert.equal(w.document.querySelector('.post-meta strong').textContent, '@Anonymous');
  assert.equal(w.document.querySelector('.empty-feed'), null);
});
