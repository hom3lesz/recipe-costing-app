const SyncEngine = require('../sync-engine.js');

describe('isMigrationStamp', () => {
  test('returns true for literal "migration"', () => {
    expect(SyncEngine.isMigrationStamp('migration')).toBe(true);
  });
  test('returns true for "migration:v1.2.3"', () => {
    expect(SyncEngine.isMigrationStamp('migration:v1.2.3')).toBe(true);
  });
  test('returns false for device names', () => {
    expect(SyncEngine.isMigrationStamp('laptop-abc')).toBe(false);
    expect(SyncEngine.isMigrationStamp('This PC')).toBe(false);
  });
  test('returns false for null, undefined, empty string', () => {
    expect(SyncEngine.isMigrationStamp(null)).toBe(false);
    expect(SyncEngine.isMigrationStamp(undefined)).toBe(false);
    expect(SyncEngine.isMigrationStamp('')).toBe(false);
  });
});

describe('checkSchemaVersion', () => {
  test('equal versions ok', () => {
    expect(SyncEngine.checkSchemaVersion(2, 2)).toEqual({ ok: true });
  });
  test('both missing ok', () => {
    expect(SyncEngine.checkSchemaVersion(undefined, undefined)).toEqual({ ok: true });
  });
  test('local newer ok', () => {
    expect(SyncEngine.checkSchemaVersion(3, 2)).toEqual({ ok: true });
  });
  test('local older returns reason', () => {
    const result = SyncEngine.checkSchemaVersion(1, 2);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/newer app version/i);
  });
  test('remote missing treated as 0', () => {
    expect(SyncEngine.checkSchemaVersion(2, undefined)).toEqual({ ok: true });
  });
  test('local missing treated as 0, remote set → not ok', () => {
    const result = SyncEngine.checkSchemaVersion(undefined, 2);
    expect(result.ok).toBe(false);
  });
});

describe('mergeAuditLogs helper (internal)', () => {
  test('dedupes by entry.id', () => {
    const local = [
      { id: 'a', ts: '2026-04-17T10:00:00Z', op: 'update' },
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
    ];
    const remote = [
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
      { id: 'c', ts: '2026-04-17T12:00:00Z', op: 'update' },
    ];
    const merged = SyncEngine._mergeAuditLogs(local, remote);
    expect(merged.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('sorts ascending by ts', () => {
    const local = [
      { id: 'c', ts: '2026-04-17T12:00:00Z', op: 'update' },
      { id: 'a', ts: '2026-04-17T10:00:00Z', op: 'update' },
    ];
    const remote = [
      { id: 'b', ts: '2026-04-17T11:00:00Z', op: 'update' },
    ];
    const merged = SyncEngine._mergeAuditLogs(local, remote);
    expect(merged.map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('handles missing or empty inputs', () => {
    expect(SyncEngine._mergeAuditLogs(undefined, undefined)).toEqual([]);
    expect(SyncEngine._mergeAuditLogs([], [])).toEqual([]);
    expect(SyncEngine._mergeAuditLogs([{ id: 'a', ts: '1', op: 'update' }], undefined))
      .toHaveLength(1);
  });
});

function mkState(over) {
  return Object.assign({
    ingredients: [],
    recipes: [],
    suppliers: [],
    settings: {},
    auditLog: [],
  }, over);
}

function mkIng(id, over) {
  return Object.assign({
    id,
    name: 'Ing ' + id,
    packCost: 1.00,
    _modifiedAt: '2026-04-10T00:00:00Z',
    _modifiedBy: 'laptop',
  }, over || {});
}

describe('mergeState Case 1 - one-sided records', () => {
  test('local-only record with no remote delete → kept', () => {
    const local = mkState({ ingredients: [mkIng('a')] });
    const remote = mkState();
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].id).toBe('a');
    expect(result.conflicts).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('local-only + remote delete entry, local newer → resurrected + restore entry', () => {
    const local = mkState({
      ingredients: [mkIng('a', { _modifiedAt: '2026-04-15T00:00:00Z' })],
    });
    const remote = mkState({
      auditLog: [{
        id: 'del-1',
        ts: '2026-04-12T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'a',
        by: 'desktop',
      }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.restoreEntries).toHaveLength(1);
    expect(result.restoreEntries[0].op).toBe('restore');
    expect(result.restoreEntries[0].entityId).toBe('a');
    expect(result.restoreEntries[0].notes).toMatch(/resurrected/i);
    expect(result.restoreEntries[0].revertedEntryId).toBe('del-1');
    expect(result.restoreEntries[0].by).toBe('laptop');
  });

  test('local-only + remote delete entry, delete newer → removed', () => {
    const local = mkState({
      ingredients: [mkIng('a', { _modifiedAt: '2026-04-10T00:00:00Z' })],
    });
    const remote = mkState({
      auditLog: [{
        id: 'del-1',
        ts: '2026-04-15T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'a',
        by: 'desktop',
      }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('remote-only with no local delete → kept on both sides', () => {
    const local = mkState();
    const remote = mkState({ ingredients: [mkIng('b')] });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].id).toBe('b');
  });

  test('remote-only + local delete entry, remote newer → resurrected', () => {
    const local = mkState({
      auditLog: [{
        id: 'del-2',
        ts: '2026-04-10T00:00:00Z',
        op: 'delete',
        entityType: 'ingredient',
        entityId: 'b',
        by: 'laptop',
      }],
    });
    const remote = mkState({
      ingredients: [mkIng('b', { _modifiedAt: '2026-04-15T00:00:00Z' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.restoreEntries).toHaveLength(1);
    expect(result.restoreEntries[0].revertedEntryId).toBe('del-2');
  });

  test('both deleted → stays deleted, no resurrect', () => {
    const local = mkState({
      auditLog: [{ id: 'del-x', ts: '2026-04-10T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'laptop' }],
    });
    const remote = mkState({
      auditLog: [{ id: 'del-y', ts: '2026-04-11T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'desktop' }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(0);
    expect(result.restoreEntries).toHaveLength(0);
  });

  test('merged auditLog contains both delete entries deduped', () => {
    const local = mkState({
      auditLog: [{ id: 'del-x', ts: '2026-04-10T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'laptop' }],
    });
    const remote = mkState({
      auditLog: [{ id: 'del-y', ts: '2026-04-11T00:00:00Z', op: 'delete', entityType: 'ingredient', entityId: 'a', by: 'desktop' }],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.auditLog.map(e => e.id).sort()).toEqual(['del-x', 'del-y']);
  });
});

describe('mergeState Case 2 - both sides exist, no field conflicts', () => {
  test('identical records → no-op', () => {
    const ing = mkIng('a', { packCost: 2.5, _modifiedAt: '2026-04-10T00:00:00Z' });
    const local = mkState({ ingredients: [ing] });
    const remote = mkState({ ingredients: [{ ...ing }] });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients).toHaveLength(1);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5);
    expect(result.conflicts).toHaveLength(0);
  });

  test('only local changed → keeps local', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 5.0, _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'laptop' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'desktop' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(5.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('only remote changed → takes remote', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'laptop' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 5.0, _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'desktop' })],
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(5.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('bootstrap (lastSync=null), identical → no-op', () => {
    const ing = mkIng('a', { packCost: 2.5 });
    const local = mkState({ ingredients: [ing] });
    const remote = mkState({ ingredients: [{ ...ing }] });
    const result = SyncEngine.mergeState(local, remote, null, 'laptop');
    expect(result.conflicts).toHaveLength(0);
    expect(result.mergedState.ingredients[0].packCost).toBe(2.5);
  });

  test('bootstrap differ → LWW wins, no conflicts', () => {
    const local = mkState({
      ingredients: [mkIng('a', { packCost: 1.0, _modifiedAt: '2026-04-08T00:00:00Z' })],
    });
    const remote = mkState({
      ingredients: [mkIng('a', { packCost: 2.0, _modifiedAt: '2026-04-12T00:00:00Z' })],
    });
    const result = SyncEngine.mergeState(local, remote, null, 'laptop');
    expect(result.mergedState.ingredients[0].packCost).toBe(2.0);
    expect(result.conflicts).toHaveLength(0);
  });

  test('settings merged via LWW (one-sided change)', () => {
    const local = mkState({
      settings: { currency: 'GBP', _modifiedAt: '2026-04-08T00:00:00Z', _modifiedBy: 'laptop' },
    });
    const remote = mkState({
      settings: { currency: 'USD', _modifiedAt: '2026-04-15T00:00:00Z', _modifiedBy: 'desktop' },
    });
    const result = SyncEngine.mergeState(local, remote, '2026-04-09T00:00:00Z', 'laptop');
    expect(result.mergedState.settings.currency).toBe('USD');
  });
});
