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
