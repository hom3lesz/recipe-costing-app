const ConflictResolver = require('../conflict-resolver.js');

function mkConflict(over) {
  return Object.assign({
    id: 'c1',
    kind: 'field-conflict',
    entityType: 'ingredient',
    entityId: 'a',
    field: 'packCost',
    localValue: 2.5,
    remoteValue: 2.75,
    localModifiedAt: '2026-04-18T09:00:00Z',
    localModifiedBy: 'This device',
    remoteModifiedAt: '2026-04-18T10:00:00Z',
    remoteModifiedBy: 'Kitchen-Mac',
    ts: '2026-04-18T10:00:00Z',
  }, over || {});
}

function mkState(over) {
  return Object.assign({
    ingredients: [], recipes: [], suppliers: [],
    currency: '£', activeGP: 70, vatRate: 20, recipeCategories: [],
    auditLog: [],
  }, over || {});
}

describe('pruneMissingRecords', () => {
  test('keeps entries whose top-level ingredient still exists', () => {
    var queue = [mkConflict()];
    var state = mkState({ ingredients: [{ id: 'a', name: 'Cucumber', packCost: 2.5 }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('drops entries whose top-level record is gone', () => {
    var queue = [mkConflict()];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent recipe is missing', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState();
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('drops nested entry when parent exists but nested row is gone', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(0);
  });

  test('keeps nested entry when parent and nested row both exist', () => {
    var queue = [mkConflict({ entityType: 'recipeIngredient', entityId: 'ing1', parentId: 'r1', field: 'qty' })];
    var state = mkState({ recipes: [{ id: 'r1', name: 'Carbonara', ingredients: [{ ingId: 'ing1', qty: 200 }] }] });
    expect(ConflictResolver.pruneMissingRecords(queue, state)).toHaveLength(1);
  });

  test('keeps settings entries unconditionally', () => {
    var queue = [mkConflict({ entityType: 'settings', entityId: 'vatRate', field: 'vatRate' })];
    expect(ConflictResolver.pruneMissingRecords(queue, mkState())).toHaveLength(1);
  });

  test('empty or non-array input returns []', () => {
    expect(ConflictResolver.pruneMissingRecords([], mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(null, mkState())).toEqual([]);
    expect(ConflictResolver.pruneMissingRecords(undefined, mkState())).toEqual([]);
  });
});
