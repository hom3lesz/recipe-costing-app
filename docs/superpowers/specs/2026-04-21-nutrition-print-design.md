# Nutrition Print Improvements Design

**Goal:** Fix missing nutrition on recipe print cards that use sub-recipes, and add an optional nutrition panel to Menu Print.

**Architecture:** Two independent changes in `src/app.js` — a one-line bug fix in `printRecipeCard`, and a checkbox + rendering addition in the Menu Print flow.

**Tech Stack:** Vanilla JS, existing `recipeNutritionTotal()` function, existing horizontal nutrition bar HTML pattern from recipe card print.

---

## Change 1 — Recipe Card Print: fix sub-recipe nutrition

### Bug
`printRecipeCard()` calls `recipeNutrition(recipe)` (the legacy function) which only sums nutrition from direct ingredients and completely ignores sub-recipe components. The in-app recipe header correctly uses `recipeNutritionTotal(recipe)` which recursively follows sub-recipe references.

### Fix
In `printRecipeCard()`, replace:
```js
const nutrition = recipeNutrition(recipe);
```
with:
```js
const nutrition = recipeNutritionTotal(recipe);
```

`recipeNutritionTotal` returns an object with `{ kcal, protein, fat, carbs, partial }` divided by portions — the same shape `recipeNutrition` returns, so no other changes are needed.

### Acceptance criteria
- A recipe whose only ingredients are sub-recipes shows correct kcal/protein/fat/carbs on the printed card.
- A recipe with both direct ingredients and sub-recipes shows the combined total.
- A recipe with only direct ingredients (no sub-recipes) is unchanged.

---

## Change 2 — Menu Print: optional nutrition panel

### Current state
`printMenuCard()` builds a menu card per recipe with name, notes, allergens, dietary tags, and pricing. It does not compute or display nutrition at all.

### Addition

**Dialog checkbox**
The Menu Print modal (the options dialog shown before printing) gets a new checkbox:
- Label: `Include nutrition info`
- Default: unchecked
- Not persisted between sessions

**Per-card nutrition panel**
When the checkbox is ticked, each recipe card in the printed menu renders a horizontal nutrition bar immediately after the allergens line, matching the style already used in `printRecipeCard`:

```
NUTRITION PER PORTION
┌──────────┬──────────┬──────────┬──────────┐
│ 487kcal  │  38.2g   │  22.1g   │  31.4g   │
│ CALORIES │ PROTEIN  │   FAT    │  CARBS   │
└──────────┴──────────┴──────────┴──────────┘
```

- A "NUTRITION PER PORTION" section label sits above the bar (matching the recipe card's "NUTRITION PER PORTION" heading style).
- Four equal columns: `{kcal}kcal / CALORIES`, `{protein}g / PROTEIN`, `{fat}g / FAT`, `{carbs}g / CARBS`.
- Computed via `recipeNutritionTotal(recipe)` so sub-recipes are included.
- Only rendered when `kcal > 0`. Recipes without nutrition data silently omit the panel — no blank box, no placeholder text.

### Acceptance criteria
- Unchecked (default): menu prints exactly as before — no nutrition shown.
- Checked: recipes with nutrition data show the horizontal bar; recipes without it show nothing extra.
- Sub-recipe-based recipes show correct totals (not zeros).
- The nutrition bar style is visually consistent with the existing recipe card print style.
