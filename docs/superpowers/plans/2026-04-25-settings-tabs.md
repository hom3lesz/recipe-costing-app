# Settings Top Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single long-scrolling Settings page (13 stacked cards) with 4 horizontal tabs — General, AI & Keys, Data & Backup, About — so users can jump directly to what they need.

**Architecture:** A `showSettingsTab(name)` function shows/hides four panel divs by ID and updates button highlight styles. A module-level `_settingsActiveTab` variable preserves the active tab across `renderSettingsPage()` re-renders. All existing element IDs and JS functions are untouched.

**Tech Stack:** Vanilla JS, HTML — no new dependencies.

---

## Files

- Modify: `src/app.js` — add `_settingsActiveTab` variable, `showSettingsTab()` function, one call at end of `renderSettingsPage()`
- Modify: `src/index.html` — strip header buttons, add tab bar, wrap cards in 4 panels, reorder Locations card into General panel

---

## Task 1: Add tab controller to app.js

**Files:**
- Modify: `src/app.js` (near line 14757 — `renderSettingsPage`)
- Test: `src/__tests__/costing.test.js`

- [ ] **Step 1: Write a failing test**

Open `src/__tests__/costing.test.js` and add this describe block at the end of the file (before the closing of any wrapping describe, or at top-level):

```js
describe('settings tab names', () => {
  const SETTINGS_TABS = ['general', 'ai', 'data', 'about'];

  test('there are exactly 4 tabs', () => {
    expect(SETTINGS_TABS).toHaveLength(4);
  });

  test('tab names are lowercase strings with no spaces', () => {
    SETTINGS_TABS.forEach(tab => {
      expect(typeof tab).toBe('string');
      expect(tab).toBe(tab.toLowerCase());
      expect(tab).not.toContain(' ');
    });
  });

  test('default tab is general', () => {
    const defaultTab = SETTINGS_TABS[0];
    expect(defaultTab).toBe('general');
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (these are pure-value tests)**

```
npm test
```

Expected: all new tests PASS (they test constants, not DOM).

- [ ] **Step 3: Add `_settingsActiveTab` and `showSettingsTab()` to app.js**

Find this line in `src/app.js` (line ~14757):
```js
function renderSettingsPage() {
```

Insert the following immediately **before** it:

```js
// ── Settings tab state ──────────────────────────────────────────────────────
let _settingsActiveTab = 'general';

function showSettingsTab(name) {
  _settingsActiveTab = name;
  ['general', 'ai', 'data', 'about'].forEach(function (tab) {
    const panel = document.getElementById('settings-tab-' + tab);
    if (panel) panel.style.display = tab === name ? 'flex' : 'none';
    const btn = document.querySelector('#settings-tab-bar [data-tab="' + tab + '"]');
    if (btn) {
      btn.style.color = tab === name ? 'var(--accent)' : 'var(--text-muted)';
      btn.style.borderBottomColor = tab === name ? 'var(--accent)' : 'transparent';
      btn.style.fontWeight = tab === name ? '700' : '600';
    }
  });
}

```

- [ ] **Step 4: Call `showSettingsTab` at the end of `renderSettingsPage()`**

Find the end of `renderSettingsPage()` in `src/app.js`. It currently ends with:

```js
  // Activity Log panel (Phase 2)
  if (typeof ActivityView !== 'undefined' && ActivityView.render) {
    ActivityView.render();
    ActivityView._initFilterListeners();
  }
}
```

Replace with:

```js
  // Activity Log panel (Phase 2)
  if (typeof ActivityView !== 'undefined' && ActivityView.render) {
    ActivityView.render();
    ActivityView._initFilterListeners();
  }
  // Restore active tab after re-render
  showSettingsTab(_settingsActiveTab);
}
```

- [ ] **Step 5: Run tests**

```
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```
git add src/app.js src/__tests__/costing.test.js
git commit -m "feat: add showSettingsTab() controller for settings top tabs"
```

---

## Task 2: Restructure index.html — tab bar + panels

**Files:**
- Modify: `src/index.html`

This task does two edits to `src/index.html`:
1. Strip the backup buttons from the page header (they move into the Data & Backup panel).
2. Replace the single outer wrapper div + all 13 cards with the tab bar + 4 labelled panels (also reordering the Locations card into the General panel where it belongs).

- [ ] **Step 1: Remove backup buttons from the page header**

Find this exact block in `src/index.html`:

```html
        <div style="display:flex;gap:8px">
          <button class="btn-secondary" onclick="exportBackup()">📁 Backup data</button>
          <button class="btn-secondary" onclick="openRestoreModal()">↩ Restore</button>
        </div>
```

Delete it entirely (the header now contains only the `<h1>` and subtitle).

- [ ] **Step 2: Replace the outer wrapper + all cards with the tabbed structure**

Find this exact opening line in `src/index.html`:

```html
      <div style="padding:24px 28px 40px;max-width:960px;display:flex;flex-direction:column;gap:20px">
```

Everything from that line through and including this closing line:

```html
    </div><!-- /#view-settings -->
```

Replace the entire block with the following (copy exactly):

```html
      <!-- Settings tab bar -->
      <div id="settings-tab-bar" style="display:flex;border-bottom:1px solid var(--border);padding:0 28px;background:var(--bg-card2)">
        <button onclick="showSettingsTab('general')" data-tab="general" style="padding:12px 18px;background:none;border:none;border-bottom:2px solid var(--accent);color:var(--accent);font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">⚙ General</button>
        <button onclick="showSettingsTab('ai')" data-tab="ai" style="padding:12px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">✨ AI &amp; Keys</button>
        <button onclick="showSettingsTab('data')" data-tab="data" style="padding:12px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">📦 Data &amp; Backup</button>
        <button onclick="showSettingsTab('about')" data-tab="about" style="padding:12px 18px;background:none;border:none;border-bottom:2px solid transparent;color:var(--text-muted);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">ℹ About</button>
      </div>

      <!-- ═══ Tab: General ═══════════════════════════════════════════════════ -->
      <div id="settings-tab-general" style="padding:24px 28px 40px;max-width:960px;display:flex;flex-direction:column;gap:20px">

      <!-- General Settings -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🏪 Business settings</div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">

          <div class="form-group" style="margin:0">
            <label>Currency Symbol</label>
            <select id="setting-currency" onchange="saveGeneralSettings();flashSettingsSaved()" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:7px 10px;border-radius:5px;outline:none">
              <option value="£">£ — British Pound</option>
              <option value="€">€ — Euro</option>
              <option value="$">$ — US Dollar</option>
              <option value="AED">AED — UAE Dirham</option>
              <option value="SAR">SAR — Saudi Riyal</option>
              <option value="kr">kr — Scandinavian Krone</option>
              <option value="CHF">CHF — Swiss Franc</option>
              <option value="A$">A$ — Australian Dollar</option>
              <option value="C$">C$ — Canadian Dollar</option>
            </select>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Used throughout the app for all prices</div>
          </div>

          <div class="form-group" style="margin:0">
            <label>VAT / Tax Rate (%)</label>
            <input type="number" id="setting-vat" min="0" max="100" step="0.1" placeholder="20" onchange="saveGeneralSettings();flashSettingsSaved()" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:7px 10px;border-radius:5px;outline:none;box-sizing:border-box"></input>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Applied when calculating VAT-inclusive sell prices</div>
          </div>

          <div class="form-group" style="margin:0">
            <label>Default GP Target (%)</label>
            <input type="number" id="setting-default-gp" min="10" max="90" step="1" placeholder="70" onchange="saveGeneralSettings();flashSettingsSaved()" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:7px 10px;border-radius:5px;outline:none;box-sizing:border-box"></input>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Starting GP% when opening a recipe</div>
          </div>

          <div class="form-group" style="margin:0">
            <label>Food Cost Alert Threshold (%)</label>
            <input type="number" id="setting-food-cost-target" min="1" max="100" step="1" placeholder="30" onchange="saveGeneralSettings();flashSettingsSaved()" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:13px;padding:7px 10px;border-radius:5px;outline:none;box-sizing:border-box"></input>
            <div style="font-size:11px;color:var(--text-muted);margin-top:4px">Red banner shown when recipe food cost % exceeds this</div>
          </div>

        </div>

        <div style="font-size:11px;color:var(--text-muted);padding-top:4px">Settings save automatically when you change a value.</div>
      </div>

      <!-- Appearance -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🎨 Appearance</div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div>
            <div style="font-size:13px;font-weight:600">Dark Mode</div>
            <div style="font-size:11px;color:var(--text-muted)">Switch between dark and light theme</div>
          </div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <span style="font-size:12px;color:var(--text-muted)" id="setting-theme-label">Dark</span>
            <input type="checkbox" id="setting-dark-mode" onchange="document.getElementById('setting-theme-label').textContent=this.checked?'Dark':'Light';saveGeneralSettings()" style="width:16px;height:16px;cursor:pointer"></input>
          </label>
        </div>
      </div>

      <!-- Warnings & Behaviour -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">⚠️ Warnings & Behaviour</div>

        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
          <div>
            <div style="font-size:13px;font-weight:600">Warn on Duplicate Ingredients</div>
            <div style="font-size:11px;color:var(--text-muted)">Show a warning when adding an ingredient that already exists in the library (same name)</div>
          </div>
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer">
            <input type="checkbox" id="setting-warn-duplicates" style="width:16px;height:16px;cursor:pointer"></input>
          </label>
        </div>
      </div>

      <!-- 🔒 PIN Lock -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🔒 App Lock (PIN)</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Set a 4-digit PIN to lock the app on startup. Useful if the device is shared.</p>

        <!-- Enable toggle row -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div id="pin-status-icon" style="font-size:20px">🔓</div>
            <div>
              <div id="pin-status-text" style="font-size:13px;font-weight:600">PIN lock disabled</div>
              <div id="pin-status-sub" style="font-size:11px;color:var(--text-muted)">App opens without a PIN</div>
            </div>
          </div>
          <!-- Toggle switch -->
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;user-select:none">
            <span style="font-size:12px;color:var(--text-muted)" id="pin-toggle-label">Off</span>
            <div id="pin-toggle-track" onclick="togglePinLock()" style="width:44px;height:24px;border-radius:12px;background:var(--border);position:relative;cursor:pointer;transition:background .2s;flex-shrink:0">
              <div id="pin-toggle-thumb" style="width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:3px;left:3px;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>
            </div>
          </label>
        </div>

        <!-- PIN actions (shown only when PIN is set) -->
        <div id="pin-actions-row" style="display:none;gap:8px">
          <button class="btn-secondary btn-sm" onclick="openPinSetModal()" id="pin-set-btn">🔑 Change PIN</button>
        </div>
      </div>

      <!-- Locations -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">📍 Locations</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Manage multiple locations — each with its own recipes, ingredients and suppliers.</p>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-primary btn-sm" onclick="openLocationManager()">📍 Manage Locations</button>
          <span id="settings-loc-count" style="font-size:12px;color:var(--text-muted)"></span>
        </div>
      </div>

      <!-- 🧪 Allergen Auto-Detection -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🧪 Allergen Auto-Detection</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Scan every ingredient in your library and automatically apply allergens based on the ingredient name. Existing allergens will be kept — only new ones are added.</p>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <button class="btn-secondary" onclick="openBulkPastePrice()" style="margin-bottom:12px">📋 Bulk Price Update (paste list)</button>
          <button class="btn-primary" onclick="autoDetectAllAllergens()">⚡ Auto-Detect All Allergens</button>
          <div id="allergen-scan-status" style="font-size:12px;color:var(--text-muted)"></div>
        </div>
      </div>

      </div><!-- /settings-tab-general -->

      <!-- ═══ Tab: AI & Keys ════════════════════════════════════════════════ -->
      <div id="settings-tab-ai" style="display:none;padding:24px 28px 40px;max-width:960px;flex-direction:column;gap:20px">

      <!-- AI Invoice Scanner -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">⚙ AI Invoice Scanner</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Choose which AI models appear in the invoice scanner and manage your API keys. Keys are stored locally and never leave your device except when sent directly to the AI provider.</p>
        <div style="display:flex;flex-direction:column;gap:10px">

          <!-- Claude -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <input type="checkbox" id="ai-enable-claude" onchange="saveAiSettings()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer"></input>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700">Claude Sonnet</div>
              <div style="font-size:11px;color:var(--text-muted)">Anthropic · Best accuracy · ~$0.005/scan · console.anthropic.com</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span id="ai-key-status-claude" style="font-size:12px"></span>
              <input type="password" id="ai-key-claude" placeholder="sk-ant-…" style="width:160px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:monospace;font-size:11px;padding:5px 8px;border-radius:4px;outline:none"></input>
              <button class="btn-secondary btn-sm" onclick="saveAiKey('claude')">💾 Save</button>
              <button class="btn-secondary btn-sm" onclick="clearAiKey('claude')" style="color:var(--red)">🗑</button>
            </div>
          </div>

          <!-- Gemini 2.5 Flash -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <input type="checkbox" id="ai-enable-gemini-flash" onchange="saveAiSettings()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer"></input>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700">Gemini 2.5 Flash</div>
              <div style="font-size:11px;color:var(--text-muted)">Google · 20 free/day · $0.30/M tokens · aistudio.google.com</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span id="ai-key-status-gemini-flash" style="font-size:12px"></span>
              <input type="password" id="ai-key-gemini-flash" placeholder="AIza…" style="width:160px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:monospace;font-size:11px;padding:5px 8px;border-radius:4px;outline:none"></input>
              <button class="btn-secondary btn-sm" onclick="saveAiKey('gemini-flash')">💾 Save</button>
              <button class="btn-secondary btn-sm" onclick="clearAiKey('gemini-flash')" style="color:var(--red)">🗑</button>
            </div>
          </div>

          <!-- Gemini 2.5 Flash-Lite -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <input type="checkbox" id="ai-enable-gemini-flash-lite" onchange="saveAiSettings()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer"></input>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700">Gemini 2.5 Flash-Lite</div>
              <div style="font-size:11px;color:var(--text-muted)">Google · 1,000 free/day · $0.10/M tokens · aistudio.google.com</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span id="ai-key-status-gemini-flash-lite" style="font-size:12px"></span>
              <input type="password" id="ai-key-gemini-flash-lite" placeholder="AIza…" style="width:160px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:monospace;font-size:11px;padding:5px 8px;border-radius:4px;outline:none"></input>
              <button class="btn-secondary btn-sm" onclick="saveAiKey('gemini-flash-lite')">💾 Save</button>
              <button class="btn-secondary btn-sm" onclick="clearAiKey('gemini-flash-lite')" style="color:var(--red)">🗑</button>
            </div>
          </div>

          <!-- Ollama (Local) -->
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm)">
            <input type="checkbox" id="ai-enable-ollama" onchange="saveAiSettings()" style="width:16px;height:16px;flex-shrink:0;cursor:pointer"></input>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:700">Ollama (Local)</div>
              <div style="font-size:11px;color:var(--text-muted)">Local · Free · No internet required · ollama.com</div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
              <span id="ai-key-status-ollama" style="font-size:12px"></span>
              <!-- type="text" intentional: model name is not a secret, masking would hinder usability -->
              <input type="text" id="ai-key-ollama" placeholder="e.g. qwen3:30b" style="width:160px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:monospace;font-size:11px;padding:5px 8px;border-radius:4px;outline:none"></input>
              <button class="btn-secondary btn-sm" onclick="saveOllamaModel()">💾 Save</button>
              <button class="btn-secondary btn-sm" onclick="testOllamaConnection()">🔌 Test</button>
              <button class="btn-secondary btn-sm" onclick="clearAiKey('ollama')" style="color:var(--red)">🗑</button>
            </div>
          </div>

        </div>
        <p style="font-size:11px;color:var(--text-muted);margin-top:12px">☑ Checked models appear in the scanner dropdown. Uncheck to hide ones you don't use.</p>
      </div>

      <!-- USDA Nutrition API Key -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🥗 USDA Nutrition API Key</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Used by the Nutrition Scanner tool to look up nutritional values from the US government database. Free key at <span style="color:var(--accent)">fdc.nal.usda.gov</span> — takes 30 seconds to register.</p>
        <div style="display:flex;align-items:center;gap:8px">
          <span id="usda-key-status-settings" style="font-size:12px;min-width:70px"></span>
          <input type="password" id="usda-key-input-settings" placeholder="USDA API key…" style="flex:1;max-width:260px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:monospace;font-size:11px;padding:5px 8px;border-radius:4px;outline:none">
          <button class="btn-secondary btn-sm" onclick="saveUsdaKeySettings()">💾 Save</button>
          <button class="btn-secondary btn-sm" onclick="clearUsdaKeySettings()" style="color:var(--red)">🗑 Clear</button>
        </div>
      </div>

      </div><!-- /settings-tab-ai -->

      <!-- ═══ Tab: Data & Backup ════════════════════════════════════════════ -->
      <div id="settings-tab-data" style="display:none;padding:24px 28px 40px;max-width:960px;flex-direction:column;gap:20px">

      <!-- Quick backup actions (moved from page header) -->
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="exportBackup()">📁 Backup data</button>
        <button class="btn-secondary" onclick="openRestoreModal()">↩ Restore</button>
      </div>

      <!-- 📦 Data Transfer -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">📦 Data Transfer</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">Export data to a JSON file and import it on another device. Duplicates are skipped on import.</p>

        <!-- Recipes -->
        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">🍽 Recipes <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(includes costing data, versions, notes)</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary btn-sm" onclick="exportRecipes()">⬇ Export Recipes</button>
            <button class="btn-secondary btn-sm" onclick="importRecipesFromFile()">⬆ Import Recipes</button>
          </div>
          <div id="recipe-import-status" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div>
        </div>

        <!-- Ingredients -->
        <div style="margin-bottom:14px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">🧂 Ingredients</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary btn-sm" onclick="exportIngredients()">⬇ Export Ingredients</button>
            <button class="btn-secondary btn-sm" onclick="importIngredientsFromFile()">⬆ Import (JSON)</button>
            <button class="btn-secondary btn-sm" onclick="importIngredientsFromSpreadsheet()" title="Import from Excel or CSV with column mapping">📥 Import (Excel/CSV)</button>
          </div>
          <div id="ing-import-status" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div>
        </div>

        <!-- Suppliers -->
        <div style="border-top:1px solid var(--border);padding-top:14px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">🚚 Suppliers <span style="font-size:11px;font-weight:400;color:var(--text-muted)">(includes invoice history)</span></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-secondary btn-sm" onclick="exportSuppliers()">⬇ Export Suppliers</button>
            <button class="btn-secondary btn-sm" onclick="importSuppliersFromFile()">⬆ Import (JSON)</button>
            <button class="btn-secondary btn-sm" onclick="importSuppliersFromSpreadsheet()" title="Import from Excel or CSV with column mapping">📥 Import (Excel/CSV)</button>
          </div>
          <div id="sup-import-status" style="font-size:11px;color:var(--text-muted);margin-top:6px"></div>
        </div>
      </div>

      <!-- Auto-Backup & Restore -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">🔄 Auto-Backup & Restore</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">The app automatically keeps the last 5 encrypted backups of your data before each save. Select a backup below to restore it.</p>
        <div style="display:flex;gap:8px;margin-bottom:14px">
          <button class="btn-secondary btn-sm" onclick="loadBackupList()">↻ Refresh backup list</button>
        </div>
        <div id="backup-list-status" style="font-size:12px;color:var(--text-muted);margin-bottom:10px"></div>
        <div id="backup-list" style="display:flex;flex-direction:column;gap:6px"></div>
      </div>

      <!-- Cloud Sync / Folder Backup -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">☁ Cloud Sync & Folder Backup</div>
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">
          Choose a cloud sync folder to automatically back up your data.
          Backups are saved as JSON files on each manual sync or automatically when enabled.
        </p>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:16px;padding:8px 12px;background:var(--bg-card2);border:1px solid var(--border);border-radius:var(--radius-sm);line-height:1.6">
          💡 <b style="color:var(--text-secondary)">Tip:</b> Select a folder that's synced to the cloud by an app like <b>Google Drive</b>, <b>OneDrive</b>, or <b>Dropbox</b>. The folder appears as a normal folder on your PC — the cloud app syncs it automatically in the background.
        </div>

        <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn-primary btn-sm" onclick="chooseSyncFolder()">📂 Choose Folder</button>
          <span id="sync-folder-path" style="font-size:11px;color:var(--text-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">No folder selected</span>
          <button class="btn-secondary btn-sm" onclick="openSyncFolder()" id="btn-open-sync-folder" style="display:none">📁 Open</button>
        </div>

        <div id="sync-controls" style="display:none">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
            <button class="btn-primary btn-sm" onclick="runSyncNow()">⬆ Sync Now</button>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
              <input type="checkbox" id="sync-auto-toggle" onchange="toggleAutoSync()" style="accent-color:var(--accent)">
              <span style="font-size:12px;color:var(--text-secondary)">Auto-sync on save</span>
            </label>
            <button class="btn-secondary btn-sm" onclick="clearSyncFolder()" style="font-size:11px;color:var(--red)">✕ Disconnect</button>
          </div>

          <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">
            <label style="font-size:12px;color:var(--text-secondary);white-space:nowrap">Device name:</label>
            <input type="text" id="sync-device-name" placeholder="e.g. Kitchen Laptop" style="width:180px;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-size:12px;padding:5px 8px;border-radius:4px;outline:none">
            <button class="btn-secondary btn-sm" onclick="saveDeviceName()" style="font-size:11px">Save</button>
            <span style="font-size:11px;color:var(--text-muted)">Used to identify this PC in sync backups</span>
          </div>

          <div id="sync-status" style="font-size:12px;color:var(--text-muted);margin-bottom:10px"></div>
          <div id="conflict-badge" class="hidden" style="font-size:12px;margin-bottom:10px;display:inline-flex;align-items:center;gap:6px;background:var(--red);color:white;padding:4px 10px;border-radius:12px;cursor:pointer" onclick="ConflictResolver.openResolver()" title="Resolve sync conflicts">
            <span>⚠</span><span id="conflict-badge-count">0</span><span>conflict(s) pending</span>
          </div>
          <div id="sync-backup-list" style="display:flex;flex-direction:column;gap:6px"></div>
        </div>
      </div>

      <!-- Activity Log -->
      <div class="card" id="activity-log-panel">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">📋 Activity Log</div>
        <div style="display:flex;gap:16px;min-height:300px">
          <!-- Left sidebar: filters -->
          <div style="width:200px;flex-shrink:0;display:flex;flex-direction:column;gap:14px">
            <!-- Entity toggles -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Show</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="ingredient" style="font-size:11px;padding:3px 8px">Ingredients</button>
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="recipe" style="font-size:11px;padding:3px 8px">Recipes</button>
                <button class="btn-secondary btn-sm activity-entity-toggle active" data-entity="supplier" style="font-size:11px;padding:3px 8px">Suppliers</button>
              </div>
            </div>
            <!-- Operation toggles -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Operations</div>
              <div style="display:flex;flex-wrap:wrap;gap:4px">
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="create" style="font-size:11px;padding:3px 8px">Create</button>
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="update" style="font-size:11px;padding:3px 8px">Update</button>
                <button class="btn-secondary btn-sm activity-op-toggle active" data-op="delete" style="font-size:11px;padding:3px 8px">Delete</button>
              </div>
            </div>
            <!-- Date range -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Date range</div>
              <select id="activity-date-range" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none">
                <option value="1">Today</option>
                <option value="7" selected>Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="all">All time</option>
              </select>
            </div>
            <!-- Search -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Search</div>
              <input type="text" id="activity-search" placeholder="Filter by name..." style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none;box-sizing:border-box">
            </div>
            <!-- Archives -->
            <div>
              <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;font-weight:600">Archives</div>
              <select id="activity-archives" style="width:100%;background:var(--bg-input);border:1px solid var(--border);color:var(--text-primary);font-family:var(--font);font-size:12px;padding:5px 8px;border-radius:5px;outline:none">
                <option value="">Archives...</option>
              </select>
            </div>
          </div>
          <!-- Right column: feed -->
          <div style="flex:1;min-width:0;display:flex;flex-direction:column">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;border-bottom:1px solid var(--border)">
              <span id="activity-log-count" style="font-size:12px;color:var(--text-muted)">0 entries</span>
            </div>
            <div id="activity-log-feed" style="flex:1;overflow-y:auto;max-height:400px"></div>
          </div>
        </div>
      </div>

      </div><!-- /settings-tab-data -->

      <!-- ═══ Tab: About ════════════════════════════════════════════════════ -->
      <div id="settings-tab-about" style="display:none;padding:24px 28px 40px;max-width:960px;flex-direction:column;gap:20px">

      <!-- About / Updates -->
      <div class="card">
        <div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--text-muted);font-weight:700;margin-bottom:18px">ℹ About</div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary)">Recipe Costing</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:3px">Version <span id="app-version-label">—</span></div>
            <div id="update-settings-status" style="font-size:12px;margin-top:6px"></div>
          </div>
          <button class="btn-secondary" id="check-update-btn" onclick="checkForUpdate()">Check for updates</button>
        </div>
      </div>

      </div><!-- /settings-tab-about -->

    </div><!-- /#view-settings -->
```

- [ ] **Step 3: Run tests**

```
npm test
```

Expected: all tests PASS (no test touches index.html directly).

- [ ] **Step 4: Visual check — run the app**

```
npm start
```

Open Settings. Verify:
- Tab bar shows 4 tabs: ⚙ General · ✨ AI & Keys · 📦 Data & Backup · ℹ About
- General tab is active by default (accent colour, underline)
- Click each tab — correct sections appear, others hide
- Saving an API key keeps you on the AI & Keys tab (tab persists across re-render)
- No backup buttons in the page header
- Data & Backup tab has the 📁 Backup data + ↩ Restore buttons at the top

- [ ] **Step 5: Commit**

```
git add src/index.html
git commit -m "feat: restructure settings page into 4 top tabs"
```
