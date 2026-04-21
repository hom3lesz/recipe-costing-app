# Nutrition Print Improvements Design

**Goal:** Fix missing nutrition on recipe print cards that use sub-recipes, and add an optional nutrition panel to Menu Print.

**Architecture:** Two independent changes in `src/app.js` — a one-line bug fix in `printRecipeCard`, and a checkbox + rendering addition in the Menu Print flow.

**Tech Stack:** Vanilla JS, existing `recipeNutritionTotal()` function, existing nutrition grid HTML pattern from recipe card print.

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
When the checkbox is ticked, each recipe card in the printed menu renders a small nutrition grid immediately after the allergen/tag row:

```
┌─────────────────────────────────┐
│  450 kcal  │  28g protein       │
│  12g fat   │  38g carbs         │
│        per portion              │
└─────────────────────────────────┘
```

- Layout: 2×2 grid of `kcal / protein / fat / carbs`, "per portion" label underneath — matching the style already used in `printRecipeCard`.
- Computed via `recipeNutritionTotal(recipe)` so sub-recipes are included.
- Only rendered when the recipe has at least one nutrition value (kcal > 0). Recipes without nutrition data silently omit the panel — no blank box, no placeholder text.

### Acceptance criteria
- Unchecked (default): menu prints exactly as before — no nutrition shown.
- Checked: recipes with nutrition data show the 2×2 panel; recipes without it show nothing extra.
- Sub-recipe-based recipes show correct totals (not zeros).
