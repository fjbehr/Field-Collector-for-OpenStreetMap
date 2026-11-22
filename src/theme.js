// Light / dark appearance. "auto" follows the phone's dark-mode setting.
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let current = 'auto';

function apply() {
  const dark = current === 'dark' || (current === 'auto' && !!media?.matches);
  document.documentElement.toggleAttribute('data-dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1520' : '#13293d');
}

export function setTheme(mode) {
  current = mode || 'auto';
  apply();
}

media?.addEventListener?.('change', apply);
