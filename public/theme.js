/** Apply the explicit DevNotes appearance before styles load; storage is best-effort. */
(function () {
  let theme = 'light';
  try {
    const saved = localStorage.getItem('devnotes_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (_) { /* Keep Light when browser storage is unavailable. */ }

  /** Apply a valid selection and retain it for this page even if persistence fails.
   * Args:
   *   value: The requested Light or Dark preference.
   */
  function applyTheme(value) {
    theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const select = document.getElementById('appearance');
    if (select) select.value = theme;
  }

  applyTheme(theme);
  document.addEventListener('DOMContentLoaded', function bindAppearance() {
    const select = document.getElementById('appearance');
    applyTheme(theme);
    select.addEventListener('change', function saveAppearance() {
      applyTheme(select.value);
      try { localStorage.setItem('devnotes_theme', theme); } catch (_) { /* Session choice still applies. */ }
    });
  }, { once: true });
}());
