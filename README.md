# DevNotes — Developer Blog Demo

A single-process Express application with vanilla HTML, CSS and JavaScript. The interface offers warm Light and charcoal Dark appearances, editorial typography and responsive reading/authoring surfaces. The existing name, content and demo workflows are retained; no framework migration or database was introduced.

## Run
Requires Node.js 22 or newer and npm.

```bash
npm ci --no-bin-links
npm start
```

Open http://localhost:3000. Express reads `PORT` from the process environment (default 3000); `.env.example` documents it. It does **not** automatically load `.env`. Set environment variables in your shell or deployment environment. The root page `/` is the dependency-free health target.

## Appearance and accessibility
Use the labelled **Appearance** selector in the header with pointer or keyboard. Light is the default; explicit Light/Dark is saved as `devnotes_theme` and applied before the stylesheet loads. Invalid saved values use Light. If browser storage is denied, appearance switching and demo actions remain usable for the current page; persistence cannot be guaranteed. The sign-in dialog supports Tab/Shift+Tab, Escape, backdrop/close-button dismissal and focus restoration. Forms expose inline whitespace errors, visible focus and live status messages. Long text wraps rather than being clipped; reduced motion is respected.

## Demo workflow and limitations
Choose Sign In, enter any nonempty username and password, publish a story, then Sign Out. This is **simulated authentication**, not a production security boundary. The browser stores only the demo author session; stories are page-local and reset on reload. Browser demo workflows intentionally do not call the separate demo `/api/login` and `/api/posts` endpoints. Those API contracts, transient server store, permissive validation and open publishing remain unchanged. Do not deploy this as a secure production publication service without separate authentication, authorization and persistence work.

If storage removal is denied, sign-out still works on the current page, but an earlier saved demo session may reappear on reload. Theme preferences are browser-local, not synchronized between accounts or devices. Automatic system-theme selection is not included.

## Verification
```bash
npm test
npm run build
node node_modules/@playwright/test/cli.js install chromium
node node_modules/@playwright/test/cli.js test
```

`npm test` runs Node's built-in test runner: 43 DOM/theme cases plus 65 real HTTP API cases and one containing test (109 reported passes). `npm run build` validates runtime JavaScript syntax; there is no compiled frontend bundle. Playwright starts the real Express server and runs 22 cases across Chromium desktop 1280×800/mobile 390×844, including both themes, full author journeys, persistence, storage failures, empty renderer state, safe/long text, keyboard focus, representative contrast and overflow checks. Empty-feed testing explicitly sets the transient renderer state because there is no deletion workflow.

On this Ubuntu 26.04 sandbox, Chromium installation/testing required `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64` and installation of Linux shared libraries. Use that override only where Playwright reports an unsupported compatible host. Successful browser runs save screenshots and HTML/accessibility/computed-style attachments in ignored `test-results/` for review. Other engines/viewport sizes and human visual acceptance remain unverified.

## Container
`Dockerfile` packages the same single-process app as a non-root Node 22 runtime, exposing port 3000:

```bash
docker build -t devnotes-demo .
docker run --rm -p 3000:3000 --env-file .env.example devnotes-demo
```

Container configuration is supplied; the Development stage verified native startup/build and browser behavior, not a Docker image build. No separate frontend/backend processes or Compose deployment are required by the retained architecture.

See `CHANGELOG.md` for this revision's compatibility notes.
