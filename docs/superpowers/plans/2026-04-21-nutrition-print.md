# Nutrition Print Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix recipe card print showing wrong nutrition for sub-recipe-based dishes, and add an optional "Include nutrition info" checkbox to Menu Print.

**Architecture:** Two independent changes in `src/app.js` and one in `src/index.html`. Task 1 is a one-line bug fix. Task 2 adds a checkbox to the modal HTML and wires it into the `printMenuCard` / `buildDish` logic in app.js.

**Tech Stack:** Vanilla JS, existing `recipeNutritionTotal()` function, existing nutrition bar HTML pattern from `printRecipeCard`.

---

### Task 1: Fix sub-recipe nutrition on recipe card print

**Files:**
- Modify: `src/app.js` ~line 19225 (one line change)

**Context:**  
`printRecipeCard()` is at line 19217. Line 19225 reads:
```js
const nutrition = recipeNutrition(recipe);
```
`recipeNutrition()` (legacy) only reads `recipe.ingredients` — it ignores `recipe.subRecipes` entirely.  
`recipeNutritionTotal()` (correct, line 3384) recursively follows sub-recipes and returns the same `{ kcal, protein, fat, carbs }` shape divided by portions. It is already used by the in-app recipe header.

- [ ] **Step 1: Write the failing test**

Open `src/__tests__/costing.test.js` and add at the end:

```js
describe('printRecipeCard nutrition uses recipeNutritionTotal', () => {
  test('recipeNutritionTotal includes sub-recipe nutrition', () => {
    // Sub-recipe: 1 portion yields 1, has known nutrition
    const subRecipe = {
      id: 'sub1',
      name: 'Sauce',
      portions: 1,
      yieldQty: null,
      ingredients: [],
      subRecipes: [],
    };
    // Ingredient with nutrition
    const ing = {
      id: 'i1', name: 'Cream', packSize: 100, packCost: 1,
      unit: 'ml', yieldPct: 100,
      nutrition: { kcal: 200, protein: 2, fat: 18, carbs: 3 },
    };
    subRecipe.ingredients = [{ ingId: 'i1', qty: 100, recipeUnit: 'ml' }];

    // Main recipe uses only the sub-recipe (no direct ingredients)
    const mainRecipe = {
      id: 'main1',
      name: 'Pasta',
      portions: 1,
      yieldQty: null,
      ingredients: [],
      subRecipes: [{ recipeId: 'sub1', qty: 1 }],
    };

    // Wire up the maps that recipeNutritionTotal() uses
    // recipeNutritionTotal uses getIngMap() and getRecipeMap() which read state
    state.ingredients = [ing];
    state.recipes = [subRecipe, mainRecipe];
    invalidateMaps();

    const total = recipeNutritionTotal(mainRecipe);
    expect(total.kcal).toBeCloseTo(200, 0);
    expect(total.protein).toBeCloseTo(2, 1);
  });
});
```

- [ ] **Step 2: Run the test to confirm it passes (it tests the correct function, not the print path)**

```
npm test -- --testPathPattern=costing
```
Expected: PASS — this confirms `recipeNutritionTotal` handles sub-recipes correctly.

- [ ] **Step 3: Apply the fix**

In `src/app.js` line 19225, change:
```js
const nutrition = recipeNutrition(recipe);
```
to:
```js
const nutrition = recipeNutritionTotal(recipe);
```

`recipeNutritionTotal` returns `{ kcal, protein, fat, carbs, partial }` per portion — the same keys used by the existing `nutHtml` block at line 19293, so no further changes are needed.

- [ ] **Step 4: Run all tests**

```
npm test
```
Expected: all 195+ tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app.js src/__tests__/costing.test.js
git commit -m "fix: use recipeNutritionTotal in printRecipeCard to include sub-recipe nutrition"
```

---

### Task 2: Add "Include nutrition info" checkbox to Menu Print dialog

**Files:**
- Modify: `src/index.html` ~line 1641 (add one `<label>` after the "Show allergens" label)
- Modify: `src/app.js` — `printMenuCard()` at line 18037, inner `buildDish()` function

**Context:**  
The Menu Print modal options bar is in `src/index.html` lines 1631–1646. Each option is a `<label>` containing a checkbox with an `id` prefixed `mp-`. The "Show allergens" checkbox (`mp-show-allergens`) is the last one before the menu-title input.

`printMenuCard()` in `src/app.js` (line 18037) reads those checkbox values at the top, then calls `buildDish(r)` for each recipe. `buildDish` returns an HTML string for one menu card. The allergens line is built as `allergensLine` and appended near the end of the returned string.

The nutrition bar HTML must match the existing style from `printRecipeCard` (line 19293–19306):
```js
`<div style="display:flex;gap:0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;font-size:12px">
  ${[
    ["Calories", Math.round(n.kcal) + "kcal"],
    ["Protein",  n.protein.toFixed(1) + "g"],
    ["Fat",      n.fat.toFixed(1) + "g"],
    ["Carbs",    n.carbs.toFixed(1) + "g"],
  ].map(([l, v]) =>
    `<div style="flex:1;text-align:center;padding:8px 4px;border-right:1px solid #e0e0e0">` +
    `<div style="font-size:14px;font-weight:700;color:#111">${v}</div>` +
    `<div style="color:#999;font-size:10px;text-transform:uppercase;letter-spacing:.5px">${l}</div>` +
    `</div>`
  ).join("")}
</div>`
```

- [ ] **Step 1: Add the checkbox to `src/index.html`**

Find the "Show allergens" label block (line 1640–1642):
```html
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="mp-show-allergens" onchange="renderMenuPrintPreview()" checked style="accent-color:var(--accent)"> Show allergens
      </label>
```

Add immediately after it:
```html
      <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap">
        <input type="checkbox" id="mp-show-nutrition" onchange="renderMenuPrintPreview()" style="accent-color:var(--accent)"> Nutrition info
      </label>
```

Note: unchecked by default (no `checked` attribute), triggers `renderMenuPrintPreview()` on change.

- [ ] **Step 2: Read the checkbox in `printMenuCard()` in `src/app.js`**

Find the block at line 18038–18045 where the other checkboxes are read:
```js
  const showPrices = document.getElementById("mp-show-prices")?.checked !== false;
  const showGP = document.getElementById("mp-show-gp")?.checked === true;
  const groupByCat = document.getElementById("mp-group-cat")?.checked !== false;
  const showAllergens = document.getElementById("mp-show-allergens")?.checked !== false;
```

Add one line after `showAllergens`:
```js
  const showNutrition = document.getElementById("mp-show-nutrition")?.checked === true;
```

- [ ] **Step 3: Build the nutrition HTML inside `buildDish()` in `src/app.js`**

Inside `buildDish(r)` (starts around line 18068), after the `allergensLine` variable is built (line 18089–18092), add:

```js
    let nutritionLine = "";
    if (showNutrition) {
      const n = recipeNutritionTotal(r);
      if (n && n.kcal > 0) {
        nutritionLine =
          `<div style="margin-top:6px">` +
          `<div style="font-size:8px;font-weight:700;letter-spacing:.08em;color:#888;text-transform:uppercase;margin-bottom:3px">Nutrition per portion</div>` +
          `<div style="display:flex;gap:0;border:1px solid #e0e0e0;border-radius:6px;overflow:hidden;font-size:12px">` +
          [
            ["Calories", Math.round(n.kcal) + "kcal"],
            ["Protein",  n.protein.toFixed(1) + "g"],
            ["Fat",      n.fat.toFixed(1) + "g"],
            ["Carbs",    n.carbs.toFixed(1) + "g"],
          ].map(([l, v]) =>
            `<div style="flex:1;text-align:center;padding:8px 4px;border-right:1px solid #e0e0e0">` +
            `<div style="font-size:14px;font-weight:700;color:#111">${v}</div>` +
            `<div style="color:#999;font-size:10px;text-transform:uppercase;letter-spacing:.5px">${l}</div>` +
            `</div>`
          ).join("") +
          `</div></div>`;
      }
    }
```

- [ ] **Step 4: Append `nutritionLine` to the returned card HTML**

In the `return (...)` block of `buildDish` (line 18093–18112), the current last line before the closing `</div>` is `allergensLine`:
```js
      allergensLine +
      `</div>`
```

Change it to:
```js
      allergensLine +
      nutritionLine +
      `</div>`
```

- [ ] **Step 5: Also read the checkbox in `renderMenuPrintPreview()` so the live preview updates**

Find `renderMenuPrintPreview` and check whether it calls `printMenuCard` or builds preview HTML independently.

Run:
```
grep -n "renderMenuPrintPreview" src/app.js | head -20
```

If `renderMenuPrintPreview` builds its own `buildDish`-equivalent, apply the same `showNutrition` + `nutritionLine` logic there too. If it delegates to `buildDish` already, no extra change is needed.

- [ ] **Step 6: Run all tests**

```
npm test
```
Expected: all tests pass (this change has no JS unit tests — it's pure DOM/print HTML, verified manually).

- [ ] **Step 7: Manual verification**

1. Open the app, go to a recipe that uses sub-recipes, click Print Recipe Card — confirm nutrition values are non-zero and match the in-app nutrition bar.
2. Open Menu Print, confirm "Nutrition info" checkbox appears unchecked.
3. Tick "Nutrition info" — confirm the preview updates to show a nutrition bar on each card that has nutrition data.
4. Confirm cards without nutrition data show no nutrition panel (no blank box).
5. Click Print Menu — confirm printed output matches preview.

- [ ] **Step 8: Commit**

```bash
git add src/index.html src/app.js
git commit -m "feat: add nutrition info option to Menu Print dialog"
```
