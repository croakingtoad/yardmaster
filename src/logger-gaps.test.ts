/**
 * Additional coverage for logger edge cases not covered by logger.test.ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { chmod, mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from './logger.js';

let tmpDir: string;
let logPath: string;
let logger: Logger;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yardmaster-logger-gaps-test-'));
  logPath = join(tmpDir, 'logs', 'activity.log');
  logger = new Logger(logPath);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('Logger — edge cases', () => {
  it('should not throw when logError is called with no optional params', async () => {
    await assert.doesNotReject(
      async () => await logger.logError('Standalone error'),
      'logError should handle missing app/port/details'
    );
    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.event, 'error');
    assert.strictEqual(entry.message, 'Standalone error');
    assert.strictEqual(entry.app, undefined);
    assert.strictEqual(entry.port, undefined);
  });

  it('should merge extra details into the error entry', async () => {
    await logger.logError('DB failure', 'my-app', 5432, { query: 'SELECT 1', code: 'P0001' });
    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.details.query, 'SELECT 1');
    assert.strictEqual(entry.details.code, 'P0001');
    assert.strictEqual(entry.details.success, false);
  });

  it('should silently swallow write errors (not throw)', async () => {
    // Create the log file, then make it unwritable
    await logger.logRegister('setup-app', 9000);
    await chmod(logPath, 0o444); // read-only

    // This must not throw — logger eats the error
    await assert.doesNotReject(
      async () => await logger.logRegister('fail-app', 9001),
      'Logger should not propagate file write errors'
    );
  });

  it('should handle concurrent writes without corruption', async () => {
    const writes = Array.from({ length: 10 }, (_, i) =>
      logger.logRegister(`app-${i}`, 3000 + i)
    );
    await Promise.all(writes);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);
    assert.strictEqual(lines.length, 10);
    // Each line must be valid JSON
    for (const line of lines) {
      assert.doesNotThrow(() => JSON.parse(line), `Invalid JSON: ${line}`);
    }
  });
});
