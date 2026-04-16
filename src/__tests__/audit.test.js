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
