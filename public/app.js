/** Preserve browser-only demo sessions and transient stories without API requests. */
let currentUser = null;
let modalTrigger = null;
let previousOverflow = '';
let posts = [
  {
    id: 1,
    title: "Welcome to Our New Developer Blog",
    content: "This is our inaugural post exploring full-stack engineering, clean code architecture, and agentic workflows.",
    author: "Admin",
    date: new Date().toLocaleDateString()
  },
  {
    id: 2,
    title: "Mastering Modern Web Architecture",
    content: "Building modular, fault-tolerant applications requires deliberate design patterns and reliable continuous integration.",
    author: "Sarah",
    date: new Date().toLocaleDateString()
  }
];

/** Restore only a valid demo author session; malformed or inaccessible storage is ignored. */
function init() {
  try {
    const saved = JSON.parse(localStorage.getItem('devnotes_user'));
    if (saved && typeof saved === 'object' && !Array.isArray(saved) &&
        typeof saved.username === 'string' && saved.username.trim() && saved.role === 'Author') {
      currentUser = { username: saved.username.trim(), role: 'Author' };
    }
  } catch (_) { /* Signed-out remains a usable default. */ }
  document.getElementById('auth-modal').addEventListener('click', function closeOverlay(event) {
    if (event.target === event.currentTarget) closeAuthModal();
  });
  document.addEventListener('keydown', handleModalKeydown);
  ['username', 'post-title', 'post-content'].forEach(function bindValidation(id) {
    document.getElementById(id).addEventListener('input', function clearFieldError() {
      setFieldError(id, '');
    });
  });
  updateUI();
  renderPosts();
}

/** Reflect the current demo session in the existing account and authoring controls. */
function updateUI() {
  const authBtn = document.getElementById('auth-btn');
  const greeting = document.getElementById('user-greeting');
  const createSection = document.getElementById('create-post-section');
  authBtn.textContent = currentUser ? 'Sign Out' : 'Sign In';
  authBtn.onclick = currentUser ? handleSignOut : toggleAuthModal;
  greeting.textContent = currentUser ? `Signed in as @${currentUser.username}` : '';
  greeting.classList.toggle('hidden', !currentUser);
  createSection.classList.toggle('hidden', !currentUser);
}

/** Open the sign-in dialog, or close it and restore focus to its trigger. */
function toggleAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (!modal.classList.contains('hidden')) {
    closeAuthModal();
    return;
  }
  modalTrigger = document.activeElement;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  modal.classList.remove('hidden');
  document.querySelector('header').inert = true;
  document.querySelector('main').inert = true;
  document.getElementById('username').focus();
}

/** Close idempotently, release the background, and restore the prior focus and scroll setting. */
function closeAuthModal() {
  const modal = document.getElementById('auth-modal');
  if (modal.classList.contains('hidden')) return;
  modal.classList.add('hidden');
  document.querySelector('header').inert = false;
  document.querySelector('main').inert = false;
  document.body.style.overflow = previousOverflow;
  if (modalTrigger && modalTrigger.isConnected) modalTrigger.focus();
}

/** Trap forward and reverse Tab within the open dialog and close on Escape.
 * Args:
 *   event: The document keyboard event.
 */
function handleModalKeydown(event) {
  const modal = document.getElementById('auth-modal');
  if (modal.classList.contains('hidden')) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeAuthModal();
  } else if (event.key === 'Tab') {
    const controls = Array.from(modal.querySelectorAll('button, input')).filter(control => !control.disabled);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !modal.contains(document.activeElement))) {
      event.preventDefault();
      first.focus();
    }
  }
}

/** Associate an inline validation message with its field; empty messages clear invalid state.
 * Args:
 *   id: Existing input identifier.
 *   message: Accessible error text, or an empty string.
 */
function setFieldError(id, message) {
  document.getElementById(`${id}-error`).textContent = message;
  document.getElementById(id).setAttribute('aria-invalid', String(Boolean(message)));
}

/** Sign in to the local demo; persistence failure must not block the current session.
 * Args:
 *   event: The form submission event.
 */
function handleLogin(event) {
  event.preventDefault();
  const username = document.getElementById('username').value.trim();
  setFieldError('username', username ? '' : 'Enter a username, not only spaces.');
  if (!username) { document.getElementById('username').focus(); return; }
  currentUser = { username, role: 'Author' };
  try { localStorage.setItem('devnotes_user', JSON.stringify(currentUser)); } catch (_) { /* Local demo remains signed in. */ }
  closeAuthModal();
  document.getElementById('login-form').reset();
  updateUI();
  document.getElementById('workflow-status').textContent = `Signed in as @${username}`;
}

/** End the current demo session even if saved storage cannot be removed. */
function handleSignOut() {
  currentUser = null;
  try { localStorage.removeItem('devnotes_user'); } catch (_) { /* Current page still signs out. */ }
  updateUI();
  document.getElementById('workflow-status').textContent = 'Signed out.';
}

/** Prepend a valid transient story and reset its form, preserving the existing author fallback.
 * Args:
 *   event: The form submission event.
 */
function handleCreatePost(event) {
  event.preventDefault();
  const title = document.getElementById('post-title').value.trim();
  const content = document.getElementById('post-content').value.trim();
  setFieldError('post-title', title ? '' : 'Enter an article title, not only spaces.');
  setFieldError('post-content', content ? '' : 'Enter a story body, not only spaces.');
  if (!title || !content) {
    document.getElementById(!title ? 'post-title' : 'post-content').focus();
    return;
  }
  posts.unshift({
    id: posts.length + 1, title, content,
    author: currentUser ? currentUser.username : 'Anonymous',
    date: new Date().toLocaleDateString()
  });
  document.getElementById('post-form').reset();
  renderPosts();
  document.getElementById('workflow-status').textContent = 'Story published.';
}

/** Render story text without interpreting user-supplied markup, including an empty feed state. */
function renderPosts() {
  const container = document.getElementById('posts-container');
  container.replaceChildren();
  if (!posts.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-feed';
    empty.textContent = 'No stories yet.';
    container.append(empty);
    return;
  }
  posts.forEach(function appendStory(post) {
    const article = document.createElement('article');
    article.className = 'post-card';
    const title = document.createElement('h3');
    title.textContent = post.title;
    const meta = document.createElement('div');
    meta.className = 'post-meta';
    const author = document.createElement('strong');
    author.textContent = `@${post.author}`;
    meta.append('By ', author, ` on ${post.date}`);
    const content = document.createElement('p');
    content.textContent = post.content;
    article.append(title, meta, content);
    container.append(article);
  });
}

document.addEventListener('DOMContentLoaded', init, { once: true });
