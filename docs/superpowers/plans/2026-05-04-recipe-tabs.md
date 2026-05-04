# Recipe Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple recipes to be open simultaneously in browser-style tabs inside the recipe editor panel.

**Architecture:** Add `openTabs: string[]` to the `state` object alongside the existing `activeRecipeId`. A `#recipe-tab-bar` div sits between the breadcrumb bar and `#recipe-editor`. Tab state is persisted via the existing `saveActiveLocationData` / `loadLocationData` mechanism. Max 8 tabs enforced with a toast.

**Tech Stack:** Vanilla JS, HTML, CSS (Electron app — no new dependencies)

---

## File Map

| File | Change |
|------|--------|
| `src/styles.css` | Add tab bar and tab styles |
| `src/index.html` | Add `<div id="recipe-tab-bar">` between breadcrumb row and `#recipe-editor` |
| `src/app.js` | Add `openTabs: []` to state; update save/load/new-location; add `renderTabBar()`, `switchToTab()`, `closeTab()`; update `selectRecipe()` and `renderRecipeEditor()` |

---

### Task 1: CSS — Tab Bar Styles

**Files:**
- Modify: `src/styles.css` (append to end of file)

- [ ] **Step 1: Append tab styles to `src/styles.css`**

Add this block at the very end of the file:

```css
/* ── Recipe Tab Bar ── */
#recipe-tab-bar { display:none; flex-shrink:0; align-items:flex-end; padding:0 8px; background:var(--bg-card); border-bottom:1px solid var(--border); min-height:34px; overflow:hidden; }
#recipe-tab-bar.has-tabs { display:flex; }
.recipe-tab { display:flex; align-items:center; gap:5px; padding:5px 10px 5px 12px; font-size:11px; background:var(--bg-sidebar); border:1px solid var(--border); border-bottom:none; border-radius:var(--radius-sm) var(--radius-sm) 0 0; color:var(--text-muted); cursor:pointer; margin-right:2px; position:relative; bottom:-1px; max-width:180px; transition:var(--transition); white-space:nowrap; }
.recipe-tab:hover { background:var(--bg-hover); color:var(--text-primary); }
.recipe-tab.active { background:var(--bg-card2); color:var(--text-primary); border-bottom:2px solid var(--accent); font-weight:600; }
.recipe-tab-name { overflow:hidden; text-overflow:ellipsis; max-width:140px; }
.recipe-tab-close { flex-shrink:0; background:none; border:none; padding:0 2px; line-height:1; font-size:11px; color:var(--text-muted); cursor:pointer; border-radius:var(--radius-xs); }
.recipe-tab-close:hover { background:var(--bg-hover); color:var(--text-primary); }
```

- [ ] **Step 2: Verify visually**

Open the app and navigate to a recipe. The tab bar area will not be visible yet (the HTML element doesn't exist). No errors expected.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: add recipe tab bar CSS"
```

---

### Task 2: HTML — Add Tab Bar Element

**Files:**
- Modify: `src/index.html` line 260

- [ ] **Step 1: Insert `#recipe-tab-bar` div**

In `src/index.html`, find this exact block (lines 259–260):

```html
          <span id="recipe-editor-breadcrumb" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
        <div id="recipe-editor" class="recipe-editor" style="flex:1;overflow-y:auto;min-height:0"></div>
```

Replace with:

```html
          <span id="recipe-editor-breadcrumb" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
        <div id="recipe-tab-bar"></div>
        <div id="recipe-editor" class="recipe-editor" style="flex:1;overflow-y:auto;min-height:0"></div>
```

- [ ] **Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: add #recipe-tab-bar placeholder div to editor panel"
```

---

### Task 3: State — Add `openTabs` to State and Persistence

**Files:**
- Modify: `src/app.js`

There are four places to update:

1. The `state` object (~line 700) — add `openTabs: []`
2. `saveActiveLocationData()` (~line 4694) — persist `openTabs`
3. `loadLocationData()` (~line 4719–4740) — reset and restore `openTabs`
4. New location creation (~line 4905) — include `openTabs: null`

- [ ] **Step 1: Add `openTabs` to the `state` object**

Find (line 700):
```js
  activeRecipeId: null,
```

Replace with:
```js
  activeRecipeId: null,
  openTabs: [],
```

- [ ] **Step 2: Persist `openTabs` in `saveActiveLocationData()`**

Find (line 4694):
```js
  loc.activeRecipeId = state.activeRecipeId;
}
```

Replace with:
```js
  loc.activeRecipeId = state.activeRecipeId;
  loc.openTabs = state.openTabs ? state.openTabs.slice() : [];
}
```

- [ ] **Step 3: Reset and restore `openTabs` in `loadLocationData()`**

Find (line 4719–4720):
```js
  state.activeLocationId = locationId;
  state.activeRecipeId = null;
```

Replace with:
```js
  state.activeLocationId = locationId;
  state.activeRecipeId = null;
  state.openTabs = [];
```

Find (line 4740):
```js
  state.activeRecipeId = loc.activeRecipeId || null;
}
```

Replace with:
```js
  state.activeRecipeId = loc.activeRecipeId || null;
  state.openTabs = loc.openTabs ? loc.openTabs.slice() : [];
}
```

- [ ] **Step 4: Include `openTabs` in new location object**

Find (line 4905):
```js
      activeRecipeId: null,
```

Replace with:
```js
      activeRecipeId: null,
      openTabs: [],
```

- [ ] **Step 5: Commit**

```bash
git add src/app.js
git commit -m "feat: add openTabs to state and persist through save/load/new-location"
```

---

### Task 4: Core Tab Functions — `renderTabBar`, `switchToTab`, `closeTab`

**Files:**
- Modify: `src/app.js` — add three new functions just before `selectRecipe` (~line 5581)

- [ ] **Step 1: Add the three tab functions**

Find (line 5581):
```js
function selectRecipe(id) {
```

Insert the following block immediately before that line:

```js
// ─── Tab Bar ──────────────────────────────────────────────────
function renderTabBar() {
  const bar = document.getElementById("recipe-tab-bar");
  if (!bar) return;
  const tabs = state.openTabs || [];
  if (tabs.length === 0) {
    bar.classList.remove("has-tabs");
    bar.innerHTML = "";
    return;
  }
  bar.classList.add("has-tabs");
  bar.innerHTML = tabs.map(id => {
    const r = state.recipes.find(r => r.id === id);
    const name = r ? r.name : "Unknown";
    const truncated = name.length > 22 ? name.slice(0, 22) + "…" : name;
    const isActive = id === state.activeRecipeId;
    return `<div class="recipe-tab${isActive ? " active" : ""}" onclick="switchToTab('${id}')">
      <span class="recipe-tab-name" title="${name.replace(/'/g, "&#39;")}">${truncated}</span>
      <button class="recipe-tab-close" onclick="event.stopPropagation();closeTab('${id}')" title="Close tab">✕</button>
    </div>`;
  }).join("");
}

function switchToTab(id) {
  state.activeRecipeId = id;
  renderTabBar();
  renderRecipeEditor();
}

function closeTab(id) {
  const idx = state.openTabs.indexOf(id);
  if (idx === -1) return;
  state.openTabs.splice(idx, 1);

  if (id === state.activeRecipeId) {
    if (state.openTabs.length === 0) {
      state.activeRecipeId = null;
      save();
      showRecipeList();
      return;
    }
    // Prefer the tab to the left; fall back to the right
    const newActive = state.openTabs[idx - 1] ?? state.openTabs[idx] ?? state.openTabs[0];
    state.activeRecipeId = newActive;
    save();
    renderTabBar();
    renderRecipeEditor();
  } else {
    save();
    renderTabBar();
  }
}

```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: add renderTabBar, switchToTab, closeTab functions"
```

---

### Task 5: Update `selectRecipe` for Open-or-Switch Logic

**Files:**
- Modify: `src/app.js` — replace body of `selectRecipe` (~lines 5581–5593)

The new logic:
- If `id` already in `openTabs` → switch to it (no duplicate)
- If `openTabs.length < 8` → push and open
- Else → show toast and abort

- [ ] **Step 1: Replace `selectRecipe`**

Find the entire function (lines 5581–5593):
```js
function selectRecipe(id) {
  state.activeRecipeId = id;
  recipeSnapshot = JSON.parse(
    JSON.stringify(state.recipes.find((r) => r.id === id)),
  );
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "none";
  if (editorPanel) editorPanel.style.display = "flex";
  showView("recipes");
  render();
  renderRecipeEditor();
}
```

Replace with:
```js
function selectRecipe(id) {
  if (!state.openTabs) state.openTabs = [];

  if (!state.openTabs.includes(id)) {
    if (state.openTabs.length >= 8) {
      showToast("Close a tab to open another", "warning", 3000);
      return;
    }
    state.openTabs.push(id);
  }

  state.activeRecipeId = id;
  recipeSnapshot = JSON.parse(
    JSON.stringify(state.recipes.find((r) => r.id === id)),
  );
  const listPanel = document.getElementById("recipe-list-panel");
  const editorPanel = document.getElementById("recipe-editor-panel");
  if (listPanel) listPanel.style.display = "none";
  if (editorPanel) editorPanel.style.display = "flex";
  showView("recipes");
  render();
  renderTabBar();
  renderRecipeEditor();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: update selectRecipe with tab open-or-switch logic and max-8 guard"
```

---

### Task 6: Wire `renderTabBar` into `renderRecipeEditor`

**Files:**
- Modify: `src/app.js` — `renderRecipeEditor` function (~line 5750)

`renderRecipeEditor` is called whenever the active recipe view needs to refresh. It must always rebuild the tab bar to keep active-tab highlighting in sync.

- [ ] **Step 1: Call `renderTabBar()` at the top of `renderRecipeEditor`**

Find the first lines of `renderRecipeEditor` (line 5750):
```js
function renderRecipeEditor() {
  // Always start with a clean cost cache so stale values from a previous render
  // (e.g. before an ingredient was added/removed) never bleed into this render.
  invalidateMaps();
  invalidateCostCache();
```

Replace with:
```js
function renderRecipeEditor() {
  // Always start with a clean cost cache so stale values from a previous render
  // (e.g. before an ingredient was added/removed) never bleed into this render.
  invalidateMaps();
  invalidateCostCache();
  renderTabBar();
```

- [ ] **Step 2: Commit**

```bash
git add src/app.js
git commit -m "feat: call renderTabBar from renderRecipeEditor to keep tab highlight in sync"
```

---

## Spec Coverage Check

| Spec requirement | Covered by |
|---|---|
| `openTabs: string[]` added to state | Task 3 Step 1 |
| Persisted via save/restore | Task 3 Steps 2–4 |
| Tab bar placed between breadcrumb and editor | Task 2 |
| Hidden when 0 tabs, shown when ≥1 | Task 4 — `has-tabs` class toggle |
| Clicking recipe: already open → switch, not open → push | Task 5 |
| Max 8 tabs + toast | Task 5 |
| Tab shows name truncated ~22 chars | Task 4 — `renderTabBar` |
| Active tab: amber bottom border | Task 1 — `.recipe-tab.active` |
| Close button calls `closeTab` | Task 4 — `closeTab` |
| `closeTab` activates left neighbour, then right | Task 4 — `closeTab` |
| If last tab closed → `showRecipeList()` | Task 4 — `closeTab` |
| `openTabs` untouched by "← All Recipes" | No change needed to `showRecipeList` |
| `switchToTab(id)` as dedicated function | Task 4 |
| `renderTabBar()` called from `renderRecipeEditor` | Task 6 |
