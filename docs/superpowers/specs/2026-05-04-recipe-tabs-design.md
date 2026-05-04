# Recipe Tabs Implementation Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow multiple recipes to be open simultaneously in browser-style tabs inside the recipe editor panel, so users can edit several recipes without losing context.

**Architecture:** Add `openTabs: string[]` to app state alongside the existing `activeRecipeId`. A tab bar div is injected between the breadcrumb bar and the recipe editor. All tab state is persisted via the existing save/restore mechanism.

**Tech Stack:** Vanilla JS, HTML, CSS (existing Electron app — no new dependencies)

---

## State

Add to `state` object (app.js):

```js
openTabs: [],   // ordered array of recipe IDs currently open as tabs
```

`activeRecipeId` continues to identify which tab is shown.

Both fields are included in the existing `saveLocation()` / `restoreLocation()` calls so tabs survive app restarts.

---

## Behaviour

### Opening a tab
- `selectRecipe(id)` checks whether `id` is already in `state.openTabs`.
  - **Already open:** set `state.activeRecipeId = id`, call `renderTabBar()` + `renderRecipeEditor()`.
  - **Not open, fewer than 8 tabs:** push `id` onto `state.openTabs`, set as active, render.
  - **Not open, 8 tabs already open:** show toast "Close a tab to open another" and do nothing.
- This is the single entry point — `openRecipeFromList` already delegates to `selectRecipe`, so no extra changes needed there.

### Closing a tab
`closeTab(id)`:
1. Remove `id` from `state.openTabs`.
2. If `id === state.activeRecipeId`:
   - Activate the tab immediately to the left; if none, activate the tab to the right.
   - If `openTabs` is now empty, set `activeRecipeId = null` and call `showRecipeList()`.
3. Otherwise just re-render the tab bar.
4. Call `save()`.

### "← All Recipes" breadcrumb
Works exactly as today — hides the editor panel, shows the recipe list. `openTabs` is untouched. Clicking any recipe from the list re-enters the tab system via `selectRecipe`.

### Middle-click or keyboard shortcut
Not in scope for this iteration.

---

## UI — Tab Bar

**Placement:** Option A — a new `#recipe-tab-bar` div sits between the existing breadcrumb bar and `#recipe-editor` inside `#recipe-editor-panel`.

```html
<!-- in recipe-editor-panel, between breadcrumb and editor -->
<div id="recipe-tab-bar" style="display:none"></div>
```

Hidden (`display:none`) when `openTabs` is empty. Shown when at least one tab is open.

**Each tab renders as:**
```html
<div class="recipe-tab [active]" onclick="switchToTab('ID')">
  <span class="recipe-tab-name">Recipe Name (truncated ~22 chars)</span>
  <button class="recipe-tab-close" onclick="event.stopPropagation();closeTab('ID')">✕</button>
</div>
```

Active tab: amber bottom border (`border-bottom: 2px solid var(--amber)`), slightly lighter background.

**`renderTabBar()`** — rebuilds `#recipe-tab-bar` innerHTML from `state.openTabs`. Called from `renderRecipeEditor()` and after any tab open/close.

**`switchToTab(id)`** — sets `state.activeRecipeId = id`, calls `renderTabBar()` + `renderRecipeEditor()`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/index.html` | Add `<div id="recipe-tab-bar">` between breadcrumb bar and `#recipe-editor` |
| `src/app.js` | Add `openTabs: []` to `state`; add `renderTabBar()`, `switchToTab(id)`, `closeTab(id)`; update `selectRecipe()` to implement open-or-switch logic; update `renderRecipeEditor()` to call `renderTabBar()`; include `openTabs` in `saveLocation()` / `restoreLocation()` |
| `src/styles.css` | Add `.recipe-tab-bar`, `.recipe-tab`, `.recipe-tab.active`, `.recipe-tab-name`, `.recipe-tab-close` styles |

---

## Out of Scope

- Middle-click to open in new tab
- Drag to reorder tabs
- Tab overflow scrolling (max 8 enforced instead)
- Per-tab unsaved-change indicators (dot on tab)
