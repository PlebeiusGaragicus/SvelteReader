# App Modes

SvelteReader supports multiple "modes" — distinct experiences that share common infrastructure (auth, wallet, UI shell) but provide different functionality.

## Overview

Each mode is essentially a mini-app within SvelteReader:

| Mode | Route | Purpose |
|------|-------|---------|
| Reader | `/reader` | Read and annotate EPUB books |
| Web Scrape | `/webscrape` | Search the web and synthesize answers |

The root route (`/`) serves as a welcome screen that introduces the app and guides users to log in.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      TopBar (shared)                        │
│  ┌──────────┐  ┌─────────────┐            ┌──────────────┐ │
│  │   Logo   │  │ModeSelector │            │  Cyphertap   │ │
│  └──────────┘  └─────────────┘            └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │    /    │    │ /reader  │    │/webscrape│
    │ Welcome │    │  Mode    │    │   Mode   │
    └─────────┘    └──────────┘    └──────────┘
```

## Mode Store

The active mode is tracked in `frontend/src/lib/stores/mode.svelte.ts`:

```typescript
export type AppMode = 'reader' | 'webscrape';

export interface ModeInfo {
  id: AppMode;
  name: string;
  description: string;
  icon: string;
  route: string;
}

export const MODES: ModeInfo[] = [
  {
    id: 'reader',
    name: 'Reader',
    description: 'Read and annotate ebooks',
    icon: 'BookOpen',
    route: '/reader'
  },
  {
    id: 'webscrape',
    name: 'Web Scrape',
    description: 'Search and synthesize from the web',
    icon: 'Globe',
    route: '/webscrape'
  }
];
```

The store provides:
- `modeStore.current` — Current mode ID
- `modeStore.currentInfo` — Full info for current mode
- `modeStore.setMode(mode)` — Switch modes (persists to localStorage)
- `modeStore.modes` — List of all available modes

## Mode Selector Component

Located at `frontend/src/lib/components/ModeSelector.svelte`, the mode selector:

1. Displays in the TopBar next to "SvelteReader" logo
2. Shows current mode with icon
3. Opens a popover with all available modes
4. Navigates to mode's route when selected
5. Persists selection to localStorage

### Usage

```svelte
<script>
  import ModeSelector from '$lib/components/ModeSelector.svelte';
</script>

<ModeSelector />
```

## Route Structure

Each mode has its own route directory:

```
frontend/src/routes/
├── +page.svelte          # Welcome screen (/)
├── +layout.svelte        # Shared layout with TopBar
├── reader/
│   └── +page.svelte      # Reader mode (/reader)
├── webscrape/
│   └── +page.svelte      # Web Scrape mode (/webscrape)
└── book/
    └── [id]/
        └── +page.svelte  # Book reader (shared with Reader mode)
```

## Login Behavior

### Logged Out
- `/` shows welcome screen with mode cards
- `/reader` shows Reader demo page (feature explanation)
- `/webscrape` shows Web Scrape demo page (feature explanation)

### Logged In
- `/` redirects to current mode's route
- `/reader` shows library with books
- `/webscrape` shows search input and discovery feed

## Adding a New Mode

1. **Define the mode** in `mode.svelte.ts`:
   ```typescript
   {
     id: 'newmode',
     name: 'New Mode',
     description: 'What this mode does',
     icon: 'IconName',  // Lucide icon
     route: '/newmode'
   }
   ```

2. **Add icon mapping** in `ModeSelector.svelte`:
   ```typescript
   const iconMap = {
     BookOpen,
     Globe,
     NewIcon  // Add your icon
   };
   ```

3. **Create route** at `routes/newmode/+page.svelte`:
   ```svelte
   <script>
     import { onMount } from 'svelte';
     import { cyphertap } from 'cyphertap';
     import { modeStore } from '$lib/stores/mode.svelte';

     const isLoggedIn = $derived(cyphertap.isLoggedIn);

     onMount(() => {
       if (modeStore.current !== 'newmode') {
         modeStore.setMode('newmode');
       }
     });
   </script>

   {#if !isLoggedIn}
     <!-- Demo page for logged out users -->
   {:else}
     <!-- Full functionality for logged in users -->
   {/if}
   ```

4. **Create components** in `lib/components/newmode/`:
   - Mode-specific UI components
   - Export via `index.ts`

5. **Create services** in `lib/services/`:
   - API clients
   - Business logic

## Shared Infrastructure

All modes share:

| Component | Purpose |
|-----------|---------|
| TopBar | Navigation, mode selector, auth |
| Cyphertap | Nostr auth, Cashu wallet |
| Theme | Dark/light mode via mode-watcher |
| Toasts | Notifications via svelte-sonner |
| Storage | IndexedDB, localStorage patterns |

## Philosophy

Modes follow the SvelteReader philosophy:

- **Client-side first**: Each mode stores its data locally
- **Nostr identity**: Same identity across all modes
- **Pay-per-use**: Each mode can have its own payment model
- **Offline capable**: Core features work without internet
- **Modular**: Modes are independent but share infrastructure

