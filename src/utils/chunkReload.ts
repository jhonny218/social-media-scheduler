// Recover from stale-build chunk failures.
//
// Vite emits content-hashed chunks, and a deploy replaces them. A browser that
// still has the previous index.html then asks for a chunk that no longer
// exists, and the dynamic import rejects. Without handling, that rejection
// unmounts the React tree — which looks exactly like being logged out, since
// AuthProvider remounts with no user and the route guard redirects to /login.
//
// Reloading picks up the current index.html and its matching chunk names. The
// sessionStorage flag means we only ever do this once per tab, so a genuinely
// broken deploy can't put the page in a reload loop.

const RELOAD_FLAG = 'chunk-reload-attempted';

const isChunkLoadError = (message: string): boolean =>
  message.includes('Failed to fetch dynamically imported module') ||
  message.includes('error loading dynamically imported module') ||
  message.includes('Importing a module script failed');

const reloadOnce = (reason: string): void => {
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    console.error(`Chunk load failed again after reload (${reason}) — not retrying`);
    return;
  }

  console.warn(`Stale build detected (${reason}) — reloading to pick up the current deploy`);
  sessionStorage.setItem(RELOAD_FLAG, '1');
  window.location.reload();
};

export const installChunkErrorReload = (): void => {
  // Fired by Vite's preload helper when a chunk 404s.
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnce('vite:preloadError');
  });

  // The SPA rewrite can return index.html for a missing chunk, in which case
  // the request succeeds and the failure surfaces only when the browser tries
  // to evaluate HTML as a module. That path never reaches vite:preloadError.
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? '');
    if (isChunkLoadError(message)) {
      event.preventDefault();
      reloadOnce('dynamic import rejected');
    }
  });
};

// A load that gets far enough to run the app is proof the build is coherent,
// so clear the flag and leave the next stale deploy free to reload again.
export const clearChunkReloadFlag = (): void => {
  sessionStorage.removeItem(RELOAD_FLAG);
};
