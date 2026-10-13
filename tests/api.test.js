/** Regress existing HTTP contracts using a real, unchanged Express server on PORT=3000. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const base = 'http://127.0.0.1:3000';
let server;
let output = '';

before(async () => {
  server = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '3000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { output += chunk; });
  server.stderr.on('data', chunk => { output += chunk; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${output}`);
    if (output.includes('Blog server running')) {
      try {
        const response = await fetch(`${base}/api/posts`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) return;
      } catch (_) { /* Poll until ready, rather than relying on a fixed sleep. */ }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Server startup timed out: ${output}`);
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
});

/** Send actual JSON HTTP requests without fabricating authentication restrictions. */
async function post(route, body) {
  return fetch(`${base}${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('page and all runtime assets are served with their expected content types', async () => {
  for (const [route, type, content] of [['/', /text\/html/, 'Ideas, Code &amp; Insights'], ['/style.css', /text\/css/, '--surface'], ['/app.js', /javascript/, 'function handleCreatePost'], ['/theme.js', /javascript/, 'devnotes_theme']]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), type);
    assert.ok((await response.text()).includes(content));
  }
  const missing = await fetch(`${base}/not-a-real-route`);
  assert.equal(missing.status, 404);
});

test('initial API feed retains the existing two stories and full post shape', async () => {
  const response = await fetch(`${base}/api/posts`);
  assert.equal(response.status, 200);
  const { posts } = await response.json();
  assert.equal(posts.length, 2);
  assert.deepEqual(posts.map(p => [p.id, p.title, p.author]), [[1, 'Welcome to Our New Developer Blog', 'Admin'], [2, 'Mastering Modern Web Architecture', 'Sarah']]);
  assert.equal(posts[0].content, 'This is our inaugural post exploring full-stack engineering, clean code architecture, and agentic workflows.');
  assert.equal(posts[1].content, 'Building modular, fault-tolerant applications requires deliberate design patterns and reliable continuous integration.');
  for (const story of posts) {
    assert.deepEqual(Object.keys(story).sort(), ['author', 'content', 'date', 'id', 'title']);
    assert.ok(story.date.length > 0);
  }
});

for (const body of [{}, { username: 'builder' }, { password: 'demo' }, { username: '', password: 'demo' }, { username: 'builder', password: '' }]) {
  test(`API login rejects missing credentials ${JSON.stringify(body)}`, async () => {
    const response = await post('/api/login', body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Username and password required' });
  });
}

test('API demo login accepts arbitrary credentials and returns its existing token shape', async () => {
  const response = await post('/api/login', { username: 'builder', password: 'anything' });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.user, { username: 'builder', role: 'Author' });
  assert.match(body.token, /^mock-jwt-token-\d+$/);
});

for (const body of [{}, { title: 'Title' }, { content: 'Body' }, { title: '', content: 'Body' }, { title: 'Title', content: '' }]) {
  test(`API publishing rejects missing story fields ${JSON.stringify(body)}`, async () => {
    const response = await post('/api/posts', body);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'Title and content required' });
    const feed = await (await fetch(`${base}/api/posts`)).json();
    assert.equal(feed.posts.length, 2);
  });
}

test('API publishing needs no token, preserves author/text, prepends and falls back to Anonymous', async () => {
  const response = await post('/api/posts', { title: '<b>Title</b>', content: 'Body', author: 'builder' });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  assert.deepEqual(body.post, { id: 3, title: '<b>Title</b>', content: 'Body', author: 'builder', date: new Date().toLocaleDateString() });
  const anonymous = await post('/api/posts', { title: 'Anonymous story', content: 'Another body' });
  assert.equal(anonymous.status, 201);
  const anonBody = await anonymous.json();
  assert.equal(anonBody.post.author, 'Anonymous');
  assert.equal(anonBody.post.id, 4);
  const feed = await (await fetch(`${base}/api/posts`)).json();
  assert.deepEqual(feed.posts.slice(0, 2), [anonBody.post, body.post]);
  assert.equal(feed.posts.length, 4);
});

test('existing truthy whitespace API behavior is unchanged, unlike browser inline validation', async () => {
  const login = await post('/api/login', { username: ' ', password: ' ' });
  assert.equal(login.status, 200);
  assert.deepEqual((await login.json()).user, { username: ' ', role: 'Author' });
  const story = await post('/api/posts', { title: ' ', content: ' ' });
  assert.equal(story.status, 201);
  const body = await story.json();
  assert.equal(body.post.title, ' ');
  assert.equal(body.post.content, ' ');
});

test('malformed JSON receives Express 400 rather than changing state', async () => {
  const beforeFeed = await (await fetch(`${base}/api/posts`)).json();
  const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
  assert.equal(response.status, 400);
  assert.deepEqual(await (await fetch(`${base}/api/posts`)).json(), beforeFeed);
});
