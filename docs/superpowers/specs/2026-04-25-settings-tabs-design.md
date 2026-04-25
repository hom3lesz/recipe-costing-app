# Settings Top Tabs Refactor — Design Spec

## Goal

Replace the single long-scrolling Settings page (13 stacked cards) with a 4-tab navigation so users can jump directly to what they need without hunting down the page.

## Tab Structure

| Tab | Label | Sections inside |
|-----|-------|----------------|
| `general` | ⚙ General | Business Settings, Appearance, Warnings & Behaviour, App Lock (PIN), Locations, Allergen & Tools |
| `ai` | ✨ AI & Keys | AI Models (Claude / Gemini Flash / Gemini Flash-Lite / Ollama), USDA Nutrition API Key |
| `data` | 📦 Data & Backup | Data Transfer, Auto-Backup & Restore, Cloud Sync & Folder Backup, Activity Log |
| `about` | ℹ About | About & Updates |

Default active tab on open: `general`.

## Architecture

### `src/index.html` changes

1. **Tab bar** — inserted at the top of `#view-settings` content area, below the page header:
   ```html
   <div id="settings-tab-bar" style="...">
     <button onclick="showSettingsTab('general')" data-tab="general" ...>⚙ General</button>
     <button onclick="showSettingsTab('ai')"      data-tab="ai"      ...>✨ AI & Keys</button>
     <button onclick="showSettingsTab('data')"    data-tab="data"    ...>📦 Data & Backup</button>
     <button onclick="showSettingsTab('about')"   data-tab="about"   ...>ℹ About</button>
   </div>
   ```

2. **Four panels** — each wraps the existing card sections that belong to it:
   ```html
   <div id="settings-tab-general"> <!-- Business, Appearance, Warnings, PIN, Locations, Allergen cards --> </div>
   <div id="settings-tab-ai">      <!-- AI models card, USDA card --> </div>
   <div id="settings-tab-data">    <!-- Data Transfer, Auto-Backup, Cloud Sync, Activity Log cards --> </div>
   <div id="settings-tab-about">   <!-- About card --> </div>
   ```
   Inactive panels are hidden with `display:none`. Active panel is shown with `display:flex; flex-direction:column; gap:20px`.

3. **Page header cleanup** — the "📁 Backup data" and "↩ Restore" buttons are removed from the page header and relocated inside the Data & Backup panel (above the Auto-Backup card). The header contains only the title and subtitle.

### `src/app.js` changes

1. **`_settingsActiveTab` variable** — module-level string, initialised to `'general'`. Persists the active tab across `renderSettingsPage()` re-renders so the user stays on the same tab after saving a key etc.

2. **`showSettingsTab(name)` function** — new function:
   - Sets `_settingsActiveTab = name`
   - Shows the panel `#settings-tab-<name>` (sets `display` to `flex`)
   - Hides the other three panels (sets `display` to `none`)
   - Updates tab button styles: active tab gets accent colour + bottom border; inactive tabs get muted colour + no border

3. **`renderSettingsPage()` addition** — one line appended at the end of the existing function:
   ```js
   showSettingsTab(_settingsActiveTab);
   ```
   This ensures the correct panel is visible after every re-render.

## Styling

Tab bar uses the existing CSS variables (`--accent`, `--border`, `--text-muted`, `--bg-card2`). No new CSS classes needed. Tab buttons styled inline for consistency with the rest of the app (existing pattern).

Active tab button: `color: var(--accent); border-bottom: 2px solid var(--accent); font-weight: 700`
Inactive tab button: `color: var(--text-muted); border-bottom: 2px solid transparent; font-weight: 600`

## What Does NOT Change

- All existing element `id` attributes are preserved — no JS functions need updating
- `renderSettingsPage()` logic is unchanged except for the final `showSettingsTab()` call
- All existing event handlers (`saveGeneralSettings`, `saveAiKey`, `clearAiKey`, `saveOllamaModel`, etc.) are unchanged
- The `max-width: 960px` content constraint moves inside each panel (not the tab bar)

## Out of Scope

- No animation or transitions on tab switch (keep it simple)
- No URL hash routing for tabs
- No persistence of active tab to `state` / disk
