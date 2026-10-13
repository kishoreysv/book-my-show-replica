# Changelog

## UI refresh and selectable dark theme

### Added
- Accessible native Light/Dark Appearance selector, Light default, browser-local `devnotes_theme` persistence and early preference application in new `public/theme.js`.
- Resilient preference/session storage handling so denied storage or malformed demo sessions do not block current-page actions.
- Node/jsdom theme and workflow tests, real HTTP API regressions, and Playwright desktop/mobile journeys with screenshots and accessibility/HTML/computed-style evidence.
- Root `Dockerfile`, `.dockerignore` and `.env.example` for the existing single-process runtime.

### Changed
- `public/index.html`: retains existing DevNotes content/actions; adds semantic landmarks, skip link, selector, favicon, accessible dialog metadata and inline error/live-status regions.
- `public/style.css`: replaces dark-only blue/indigo gradients/glass with reusable warm Light/charcoal Dark surfaces, green accent, editorial serif headings, readable measure, responsive controls, visible focus, reduced motion and long-text wrapping.
- `public/app.js`: preserves browser-only demo sign-in/sign-out and transient authoring; adds dialog focus trap/Escape/backdrop/close restoration, whitespace feedback, guarded session storage and safe text-node rendering instead of interpreting user markup.
- `package.json`, `package-lock.json`, `playwright.config.js`, `.gitignore`: add explicit test/syntax-build commands, pinned test dependencies, real-server browser configuration and generated-output exclusions.
- `README.md`: documents actual architecture, verification, appearance policy and limitations. Code graph refreshed after verified commits.

### Compatibility and migration
No backend API, database schema, framework or product-name migration. `server.js` is unchanged. Existing IDs/handler workflows remain. Default appearance changes from dark-only to Light; users can explicitly choose Dark and retain that preference. User-entered markup now appears as literal text, not HTML. No data migration is needed; the new preference key is independent of `devnotes_user`.

### Verification and retained limitations
109 Node test passes (43 DOM/theme cases, 65 API cases and one parent); 22 Chromium E2E passes on desktop/mobile; syntax build passes. Read-only test critic round 2 PASS, score 1.0, no high fails. Long-login-status wrapping and exact browser locator issues found during review/testing were fixed without weakening assertions.

The baseline had no test runner/tests/build script. Demo authentication is still simulated, browser stories reset on reload, API state resets on server restart, and browser workflows remain independent of APIs. Storage-denied persistence cannot be guaranteed. Other browsers, human visual/release approval and Docker image build are not claimed verified. Original baseline screenshot capture was not completed; original UI source remains recoverable at source commit 8060d7407332ed6d7d03d27f7fe04284e9552349; refreshed screenshots are available in test-results.
