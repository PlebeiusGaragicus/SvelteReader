# Deployment

## Static Hosting Compatibility

This app is **100% client-side** and can be hosted on any static file server:

- GitHub Pages
- Netlify
- Vercel (static)
- Cloudflare Pages
- Any HTTP file server

**No server-side code exists.**

## Code Analysis

### Route Files (all client-side)

| File | Purpose |
|------|---------|
| `src/routes/+layout.svelte` | App shell (TopBar, theme, toasts) |
| `src/routes/+page.svelte` | Library view (book grid) |
| `src/routes/book/[id]/+page.svelte` | Reader view |
| `src/routes/book/[id]/+page.ts` | Disables SSR |

**No server files:**

- ❌ No `+page.server.ts` (server-side data loading)
- ❌ No `+server.ts` (API endpoints)
- ❌ No `+layout.server.ts` (server-side layout data)

### Data Storage (browser only)

| Service | Storage | Server Needed? |
|---------|---------|----------------|
| Book metadata | localStorage | No |
| EPUB binaries | IndexedDB | No |
| Location cache | IndexedDB | No |
| EPUB rendering | epub.js iframe | No |
| Auth (CypherTap) | Nostr keys in browser | No |

## Current Adapter

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-auto';
```

`adapter-auto` detects the deployment platform automatically. Works for Vercel, Netlify, Cloudflare, etc.

## Static Adapter (for GitHub Pages)

To deploy to a pure static host like GitHub Pages:

### 1. Install adapter-static

```bash
npm install -D @sveltejs/adapter-static
```

### 2. Update svelte.config.js

```javascript
import adapter from '@sveltejs/adapter-static';

const config = {
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html'  // SPA fallback for client-side routing
    })
  }
};

export default config;
```

### 3. Build

```bash
npm run build
```

Output goes to `build/` folder.

### 4. Deploy

Upload `build/` contents to your static host.

For GitHub Pages, you can use the `gh-pages` branch or GitHub Actions.

## SPA Fallback

The `fallback: 'index.html'` setting is critical. It ensures that direct navigation to `/book/abc123` works by serving `index.html` and letting the client-side router handle the path.

Without this, refreshing on a deep link would return 404.

## Environment Considerations

### CypherTap

CypherTap connects to:
- Nostr relays (WebSocket from browser)
- Cashu mints (HTTP from browser)

These are client-side network calls, not server dependencies.

### Future Backend

If pay-per-use AI features are added (per the project requirements), a backend server would be needed. At that point, consider:

- Separate API server
- Serverless functions (Vercel/Netlify functions)
- Keep frontend static, API separate
