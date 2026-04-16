const Audit = require('../audit.js');

describe('audit module exports', () => {
  test('exposes SCHEMA_VERSION constant equal to 2', () => {
    expect(Audit.SCHEMA_VERSION).toBe(2);
  });

  test('exposes TRACKED_COLLECTIONS array', () => {
    expect(Audit.TRACKED_COLLECTIONS).toEqual(['ingredients', 'recipes', 'suppliers']);
  });

  test('INGREDIENT_TRACKED_FIELDS contains key pricing fields', () => {
    expect(Audit.INGREDIENT_TRACKED_FIELDS).toEqual(
      expect.arrayContaining(['name', 'packCost', 'packSize', 'packCount', 'unit', 'yieldPct', 'category', 'supplierId'])
    );
  });

  test('newLogId returns a unique-ish string prefixed with "log_"', () => {
    const a = Audit.newLogId();
    const b = Audit.newLogId();
    expect(a).toMatch(/^log_/);
    expect(a).not.toBe(b);
  });
});

describe('buildSnapshot', () => {
  const sampleState = () => ({
    ingredients: [
      { id: 'ing1', name: 'Cucumber', packCost: 0.9, packSize: 1, unit: 'each', yieldPct: 100, _costCache: 999 },
      { id: 'ing2', name: 'Beef',     packCost: 12,  packSize: 1000, unit: 'g',  yieldPct: 92  },
    ],
    recipes: [
      {
        id: 'rec1', name: 'Salad', portions: 4,
        ingredients: [
          { ingId: 'ing1', qty: 2, recipeUnit: 'each', wastePct: 0 },
        ],
        subRecipes: [],
      },
    ],
    suppliers: [
      { id: 'sup1', name: 'Brakes', email: 'a@b.c', phone: '123' },
    ],
  });

  test('snapshot maps each collection id to a flat clone of tracked fields', () => {
    const snap = Audit.buildSnapshot(sampleState());
    expect(snap.ingredients.get('ing1').packCost).toBe(0.9);
    expect(snap.ingredients.get('ing1').name).toBe('Cucumber');
    expect(snap.recipes.get('rec1').name).toBe('Salad');
    expect(snap.suppliers.get('sup1').email).toBe('a@b.c');
  });

  test('snapshot ignores runtime cache fields like _costCache', () => {
    const snap = Audit.buildSnapshot(sampleState());
    expect(snap.ingredients.get('ing1')._costCache).toBeUndefined();
  });

  test('snapshot captures recipe nested ingredient rows by ingId', () => {
    const snap = Audit.buildSnapshot(sampleState());
    const rec = snap.recipes.get('rec1');
    expect(rec.ingredients).toHaveLength(1);
    expect(rec.ingredients[0]).toEqual({ ingId: 'ing1', qty: 2, recipeUnit: 'each', wastePct: 0 });
  });

  test('snapshot is a deep clone — mutating the original does not affect it', () => {
    const state = sampleState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 99;
    expect(snap.ingredients.get('ing1').packCost).toBe(0.9);
  });

  test('snapshot handles empty / missing collections gracefully', () => {
    const snap = Audit.buildSnapshot({});
    expect(snap.ingredients.size).toBe(0);
    expect(snap.recipes.size).toBe(0);
    expect(snap.suppliers.size).toBe(0);
  });
});
