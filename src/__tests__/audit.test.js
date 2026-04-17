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

describe('computeDiff — top-level records', () => {
  const baseState = () => ({
    ingredients: [
      { id: 'ing1', name: 'Cucumber', packCost: 0.9, packSize: 1, unit: 'each', yieldPct: 100 },
      { id: 'ing2', name: 'Beef',     packCost: 12,  packSize: 1000, unit: 'g',  yieldPct: 92 },
    ],
    recipes: [],
    suppliers: [],
  });

  test('no changes → empty entries', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toEqual([]);
  });

  test('single field change → one update entry with before/after', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'update',
      entity: 'ingredient',
      entityId: 'ing1',
      entityName: 'Cucumber',
      field: 'packCost',
      before: 0.9,
      after: 0.95,
      device: 'TestDevice',
    });
    expect(entries[0].ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entries[0].id).toMatch(/^log_/);
  });

  test('multiple field changes on same record → one entry per field', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    state.ingredients[0].yieldPct = 90;
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(2);
    const fields = entries.map(e => e.field).sort();
    expect(fields).toEqual(['packCost', 'yieldPct']);
  });

  test('new record → one create entry with full record in after', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients.push({ id: 'ing3', name: 'Tomato', packCost: 1.5, packSize: 1, unit: 'each', yieldPct: 100 });
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'create', entity: 'ingredient', entityId: 'ing3', entityName: 'Tomato',
    });
    expect(entries[0].after.packCost).toBe(1.5);
    expect(entries[0].field).toBeUndefined();
  });

  test('deleted record → one delete entry with full record in before', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients.splice(1, 1); // remove Beef
    const { entries } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      op: 'delete', entity: 'ingredient', entityId: 'ing2', entityName: 'Beef',
    });
    expect(entries[0].before.packCost).toBe(12);
  });

  test('computeDiff returns stamped set of changed record ids', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { stampedIds } = Audit.computeDiff(snap, state, 'TestDevice');
    expect(stampedIds.ingredients).toEqual(new Set(['ing1']));
  });

  test('skipIds are not logged or stamped even if changed', () => {
    const state = baseState();
    const snap = Audit.buildSnapshot(state);
    state.ingredients[0].packCost = 0.95;
    const { entries, stampedIds } = Audit.computeDiff(
      snap, state, 'TestDevice',
      { skipIds: { ingredients: new Set(['ing1']) } }
    );
    expect(entries).toEqual([]);
    expect(stampedIds.ingredients.has('ing1')).toBe(false);
  });
});

describe('computeDiff — nested recipe rows', () => {
  const recipeState = () => ({
    ingredients: [],
    recipes: [
      {
        id: 'rec1', name: 'Bolognese', portions: 4,
        ingredients: [
          { ingId: 'ing1', qty: 500, recipeUnit: 'g', wastePct: 0 },
          { ingId: 'ing2', qty: 200, recipeUnit: 'g', wastePct: 5 },
        ],
        subRecipes: [
          { recipeId: 'rec-sauce', qty: 1 },
        ],
      },
    ],
    suppliers: [],
  });

  test('ingredient row added to recipe → one recipeIngredient create entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients.push({ ingId: 'ing3', qty: 1, recipeUnit: 'each', wastePct: 0 });
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'create',
      parentId: 'rec1',
      entityId: 'ing3',
    });
  });

  test('ingredient row removed from recipe → one recipeIngredient delete entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients.splice(0, 1); // remove ing1
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'delete',
      parentId: 'rec1',
      entityId: 'ing1',
    });
  });

  test('ingredient row qty change → one recipeIngredient update entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients[0].qty = 700;
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'recipeIngredient');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'update',
      parentId: 'rec1',
      entityId: 'ing1',
      field: 'qty',
      before: 500,
      after: 700,
    });
  });

  test('ingredient row reorder (no other changes) → one ingredientOrder entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients = [state.recipes[0].ingredients[1], state.recipes[0].ingredients[0]];
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.field === 'ingredientOrder');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'update', entity: 'recipe', entityId: 'rec1', field: 'ingredientOrder',
    });
    expect(relevant[0].before).toEqual(['ing1', 'ing2']);
    expect(relevant[0].after).toEqual(['ing2', 'ing1']);
  });

  test('sub-recipe added → one subRecipe create entry', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].subRecipes.push({ recipeId: 'rec-extra', qty: 2 });
    const { entries } = Audit.computeDiff(snap, state, 'Dev');
    const relevant = entries.filter(e => e.entity === 'subRecipe');
    expect(relevant).toHaveLength(1);
    expect(relevant[0]).toMatchObject({
      op: 'create', parentId: 'rec1', entityId: 'rec-extra',
    });
  });

  test('changing ingredient row qty also stamps the parent recipe', () => {
    const state = recipeState();
    const snap = Audit.buildSnapshot(state);
    state.recipes[0].ingredients[0].qty = 700;
    const { stampedIds } = Audit.computeDiff(snap, state, 'Dev');
    expect(stampedIds.recipes.has('rec1')).toBe(true);
  });
});

describe('appendLogEntries', () => {
  test('appends entries to state.auditLog', () => {
    const state = { auditLog: [] };
    Audit.appendLogEntries(state, [{ id: 'a' }, { id: 'b' }]);
    expect(state.auditLog).toHaveLength(2);
  });

  test('creates auditLog array if missing', () => {
    const state = {};
    Audit.appendLogEntries(state, [{ id: 'a' }]);
    expect(state.auditLog).toHaveLength(1);
  });

  test('no-op on empty entries array', () => {
    const state = { auditLog: [{ id: 'existing' }] };
    Audit.appendLogEntries(state, []);
    expect(state.auditLog).toHaveLength(1);
  });
});

describe('rotateLog', () => {
  function makeEntry(daysAgo) {
    const d = new Date(Date.now() - daysAgo * 86400000);
    return { id: 'log_' + Math.random(), ts: d.toISOString() };
  }

  test('no rotation if log under soft cap and all entries under retention', () => {
    const state = { auditLog: [makeEntry(1), makeEntry(2)] };
    const { archived } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(2);
    expect(archived).toEqual([]);
  });

  test('entries older than maxAgeDays are moved into archived[]', () => {
    const state = { auditLog: [makeEntry(1), makeEntry(100), makeEntry(200)] };
    const { archived } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(1);
    expect(archived).toHaveLength(2);
  });

  test('entries beyond maxEntries soft cap are moved to archived[] oldest-first', () => {
    const entries = [];
    for (let i = 0; i < 5; i++) entries.push(makeEntry(1));
    const state = { auditLog: entries };
    const { archived } = Audit.rotateLog(state, { maxEntries: 3, maxAgeDays: 90 });
    expect(state.auditLog).toHaveLength(3);
    expect(archived).toHaveLength(2);
  });

  test('archived entries are grouped by YYYY-MM for archive file routing', () => {
    const jan = { id: 'a', ts: '2025-01-15T00:00:00.000Z' };
    const feb = { id: 'b', ts: '2025-02-10T00:00:00.000Z' };
    const state = { auditLog: [jan, feb] };
    const { groupedByMonth } = Audit.rotateLog(state, { maxEntries: 2000, maxAgeDays: 1 });
    expect(groupedByMonth['2025-01']).toHaveLength(1);
    expect(groupedByMonth['2025-02']).toHaveLength(1);
  });
});

describe('bulk wrapper', () => {
  test('startBulk returns a handle; endBulk emits a single bulk-update entry', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, {
      collection: 'ingredients',
      op: 'bulk-update',
      field: 'packCost',
      notes: '+3% across all Brakes',
    });
    handle.changes.push({ id: 'ing1', name: 'A', before: 1.0, after: 1.03 });
    handle.changes.push({ id: 'ing2', name: 'B', before: 2.0, after: 2.06 });
    Audit.endBulk(state, handle, 'TestDevice');
    expect(state.auditLog).toHaveLength(1);
    expect(state.auditLog[0]).toMatchObject({
      op: 'bulk-update',
      entity: 'ingredients',
      field: 'packCost',
      notes: '+3% across all Brakes',
      count: 2,
      device: 'TestDevice',
    });
    expect(state.auditLog[0].changes).toHaveLength(2);
  });

  test('endBulk is a no-op if handle has zero changes', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    Audit.endBulk(state, handle, 'Dev');
    expect(state.auditLog).toHaveLength(0);
  });

  test('changes array is truncated at 500 with truncated flag set', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    for (let i = 0; i < 600; i++) {
      handle.changes.push({ id: 'i' + i, name: 'x', before: 0, after: 1 });
    }
    Audit.endBulk(state, handle, 'Dev');
    expect(state.auditLog[0].changes).toHaveLength(500);
    expect(state.auditLog[0].truncated).toBe(true);
    expect(state.auditLog[0].count).toBe(600);
  });

  test('handle.skipIds is a Set populated as caller records changes', () => {
    const state = { auditLog: [] };
    const handle = Audit.startBulk(state, { collection: 'ingredients', op: 'bulk-update', field: 'packCost' });
    handle.skipIds.add('ing1');
    handle.skipIds.add('ing2');
    expect(handle.skipIds.has('ing1')).toBe(true);
    expect(handle.skipIds.size).toBe(2);
  });
});

describe('MIGRATION_STAMP', () => {
  test('is exported as the literal string "migration"', () => {
    const Audit = require('../audit.js');
    expect(Audit.MIGRATION_STAMP).toBe('migration');
  });
});
