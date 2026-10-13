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

/** Read the actual shared store, checking the HTTP contract on every snapshot. */
async function readFeed() {
  const response = await fetch(`${base}/api/posts`);
  assert.equal(response.status, 200);
  return response.json();
}

/** Validate the exact locale-date contract within the request window, including midnight. */
function assertRequestDate(date, before, after) {
  assert.ok([before, after].includes(date), `Expected request-window locale date, received ${date}`);
}

// One lifecycle owns the store: every subtest is awaited, never concurrently scheduled.
test('existing API contract in an explicitly sequential shared-server scenario', { concurrency: false }, async t => {
  await t.test('page and all runtime assets are served with their expected content types', async () => {
    for (const [route, type, content] of [['/', /text\/html/, 'Ideas, Code &amp; Insights'], ['/style.css', /text\/css/, '--surface'], ['/app.js', /javascript/, 'function handleCreatePost'], ['/theme.js', /javascript/, 'devnotes_theme']]) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), type);
      assert.ok((await response.text()).includes(content));
    }
    const missing = await fetch(`${base}/not-a-real-route`);
    assert.equal(missing.status, 404);
  });

  await t.test('initial API feed retains the existing two stories and full post shape', async () => {
    const { posts } = await readFeed();
    assert.equal(posts.length, 2);
    assert.deepEqual(posts.map(p => [p.id, p.title, p.author]), [[1, 'Welcome to Our New Developer Blog', 'Admin'], [2, 'Mastering Modern Web Architecture', 'Sarah']]);
    assert.equal(posts[0].content, 'This is our inaugural post exploring full-stack engineering, clean code architecture, and agentic workflows.');
    assert.equal(posts[1].content, 'Building modular, fault-tolerant applications requires deliberate design patterns and reliable continuous integration.');
    for (const story of posts) {
      assert.deepEqual(Object.keys(story).sort(), ['author', 'content', 'date', 'id', 'title']);
      assert.ok(story.date.length > 0);
    }
  });

  const missingCredentials = [{}, { username: 'builder' }, { password: 'demo' }];
  for (const value of ['', null, false, 0]) {
    missingCredentials.push({ username: value, password: 'demo' }, { username: 'builder', password: value });
  }
  for (const body of missingCredentials) {
    await t.test(`API login rejects missing/falsy credentials ${JSON.stringify(body)}`, async () => {
      const beforeFeed = await readFeed();
      const response = await post('/api/login', body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Username and password required' });
      assert.deepEqual(await readFeed(), beforeFeed);
    });
  }

  await t.test('API demo login accepts arbitrary credentials and returns its existing token shape', async () => {
    const response = await post('/api/login', { username: 'builder', password: 'anything' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.deepEqual(body.user, { username: 'builder', role: 'Author' });
    assert.match(body.token, /^mock-jwt-token-\d+$/);
  });

  const missingStoryFields = [{}, { title: 'Title' }, { content: 'Body' }];
  for (const value of ['', null, false, 0]) {
    missingStoryFields.push({ title: value, content: 'Body' }, { title: 'Title', content: value });
  }
  for (const body of missingStoryFields) {
    await t.test(`API publishing rejects missing/falsy story fields ${JSON.stringify(body)}`, async () => {
      const beforeFeed = await readFeed();
      const response = await post('/api/posts', body);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Title and content required' });
      const feed = await readFeed();
      assert.equal(feed.posts.length, 2);
      assert.deepEqual(feed, beforeFeed);
    });
  }

  await t.test('API publishing needs no token, preserves author/text, prepends and falls back to Anonymous', async () => {
    const beforeDate = new Date().toLocaleDateString();
    const response = await post('/api/posts', { title: '<b>Title</b>', content: 'Body', author: 'builder' });
    assert.equal(response.status, 201);
    const body = await response.json();
    const afterDate = new Date().toLocaleDateString();
    assert.equal(body.success, true);
    assertRequestDate(body.post.date, beforeDate, afterDate);
    assert.deepEqual(body.post, { id: 3, title: '<b>Title</b>', content: 'Body', author: 'builder', date: body.post.date });
    const anonBeforeDate = new Date().toLocaleDateString();
    const anonymous = await post('/api/posts', { title: 'Anonymous story', content: 'Another body' });
    assert.equal(anonymous.status, 201);
    const anonBody = await anonymous.json();
    assertRequestDate(anonBody.post.date, anonBeforeDate, new Date().toLocaleDateString());
    assert.equal(anonBody.post.author, 'Anonymous');
    assert.equal(anonBody.post.id, 4);
    const feed = await readFeed();
    assert.deepEqual(feed.posts.slice(0, 2), [anonBody.post, body.post]);
    assert.equal(feed.posts.length, 4);
  });

  await t.test('existing truthy whitespace API behavior is unchanged, unlike browser inline validation', async () => {
    const login = await post('/api/login', { username: ' ', password: ' ' });
    assert.equal(login.status, 200);
    assert.deepEqual((await login.json()).user, { username: ' ', role: 'Author' });
    const beforeDate = new Date().toLocaleDateString();
    const story = await post('/api/posts', { title: ' ', content: ' ' });
    assert.equal(story.status, 201);
    const body = await story.json();
    assert.equal(body.post.title, ' ');
    assert.equal(body.post.content, ' ');
    assertRequestDate(body.post.date, beforeDate, new Date().toLocaleDateString());
  });

  for (const value of [{}, 7, [], true]) {
    for (const field of ['username', 'password']) {
      await t.test(`API login accepts truthy non-string ${field} ${JSON.stringify(value)}`, async () => {
        const beforeFeed = await readFeed();
        const credentials = { username: 'builder', password: 'demo', [field]: value };
        const response = await post('/api/login', credentials);
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.match(body.token, /^mock-jwt-token-\d+$/);
        assert.deepEqual(body, { success: true, user: { username: credentials.username, role: 'Author' }, token: body.token });
        assert.deepEqual(await readFeed(), beforeFeed);
      });
    }
    for (const field of ['title', 'content', 'author']) {
      await t.test(`API publishing preserves truthy non-string ${field} ${JSON.stringify(value)}`, async () => {
        const beforeFeed = await readFeed();
        const input = { title: 'Typed story', content: 'Typed body', author: 'builder', [field]: value };
        const beforeDate = new Date().toLocaleDateString();
        const response = await post('/api/posts', input);
        assert.equal(response.status, 201);
        const body = await response.json();
        assertRequestDate(body.post.date, beforeDate, new Date().toLocaleDateString());
        assert.deepEqual(body, { success: true, post: { id: beforeFeed.posts.length + 1, ...input, date: body.post.date } });
        assert.deepEqual(await readFeed(), { posts: [body.post, ...beforeFeed.posts] });
      });
    }
  }

  for (const author of [null, false, 0, '']) {
    await t.test(`API publishing falls back to Anonymous for falsy author ${JSON.stringify(author)}`, async () => {
      const beforeFeed = await readFeed();
      const beforeDate = new Date().toLocaleDateString();
      const response = await post('/api/posts', { title: 'Fallback story', content: 'Fallback body', author });
      assert.equal(response.status, 201);
      const body = await response.json();
      assertRequestDate(body.post.date, beforeDate, new Date().toLocaleDateString());
      assert.deepEqual(body, { success: true, post: { id: beforeFeed.posts.length + 1, title: 'Fallback story', content: 'Fallback body', author: 'Anonymous', date: body.post.date } });
      assert.deepEqual(await readFeed(), { posts: [body.post, ...beforeFeed.posts] });
    });
  }

  // Repeat field rejections after successful writes: compare full content, not only counts.
  for (const input of missingStoryFields) {
    await t.test(`API rejected fields preserve the populated feed ${JSON.stringify(input)}`, async () => {
      const beforeFeed = await readFeed();
      const response = await post('/api/posts', input);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: 'Title and content required' });
      assert.deepEqual(await readFeed(), beforeFeed);
    });
  }

  await t.test('malformed JSON receives Express 400 rather than changing state', async () => {
    const beforeFeed = await readFeed();
    const response = await fetch(`${base}/api/posts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' });
    assert.equal(response.status, 400);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(await response.text(), /SyntaxError/);
    assert.deepEqual(await readFeed(), beforeFeed);
  });

  for (const route of ['/api/login', '/api/posts']) {
    await t.test(`Express default JSON limit rejects oversized ${route} requests with 413 and no feed mutation`, async () => {
      const beforeFeed = await readFeed();
      const oversized = { username: 'builder', password: 'demo', title: 'Oversized story', content: 'x'.repeat(101 * 1024) };
      assert.ok(Buffer.byteLength(JSON.stringify(oversized)) > 100 * 1024);
      const response = await post(route, oversized);
      assert.equal(response.status, 413);
      assert.match(response.headers.get('content-type'), /text\/html/);
      assert.match(await response.text(), /PayloadTooLargeError: request entity too large/);
      const afterFeed = await readFeed();
      assert.deepEqual(afterFeed, beforeFeed);
      assert.deepEqual(afterFeed.posts.find(story => story.id === 3), beforeFeed.posts.find(story => story.id === 3));
      assert.equal(afterFeed.posts.find(story => story.id === 3).title, '<b>Title</b>');
      assert.equal(afterFeed.posts.find(story => story.id === 3).content, 'Body');
    });
  }
});
