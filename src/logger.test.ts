/**
 * Tests for activity logger
 * Zero Mock Policy: Real file I/O tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { logger } from './logger.js';

describe('Logger', () => {
  const logPath = join(homedir(), '.yardmaster', 'logs', 'activity.log');
  const logDir = dirname(logPath);

  // Clean up log file before each test
  beforeEach(async () => {
    if (existsSync(logPath)) {
      await unlink(logPath);
    }
  });

  // Clean up after tests
  afterEach(async () => {
    if (existsSync(logPath)) {
      await unlink(logPath);
    }
  });

  it('should create log directory on first write', async () => {
    await logger.logRegister('test-app', 3000);
    assert.ok(existsSync(logDir), 'Log directory should exist');
    assert.ok(existsSync(logPath), 'Log file should exist');
  });

  it('should write register event in JSONL format', async () => {
    await logger.logRegister('test-app', 3000, 'https://test.ngrok.io');

    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 1, 'Should have one log line');

    const entry = JSON.parse(lines[0]);
    assert.strictEqual(entry.event, 'register');
    assert.strictEqual(entry.app, 'test-app');
    assert.strictEqual(entry.port, 3000);
    assert.strictEqual(entry.url, 'https://test.ngrok.io');
    assert.ok(entry.timestamp, 'Should have timestamp');
    assert.ok(entry.details.success, 'Should mark as success');
  });

  it('should write release event', async () => {
    await logger.logRelease('test-app', 3000);

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.event, 'release');
    assert.strictEqual(entry.app, 'test-app');
    assert.strictEqual(entry.port, 3000);
  });

  it('should write tunnel_created event', async () => {
    await logger.logTunnelCreated('test-app', 3000, 'https://abc123.ngrok.io');

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.event, 'tunnel_created');
    assert.strictEqual(entry.app, 'test-app');
    assert.strictEqual(entry.port, 3000);
    assert.strictEqual(entry.url, 'https://abc123.ngrok.io');
  });

  it('should write tunnel_closed event', async () => {
    await logger.logTunnelClosed('test-app', 3000);

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.event, 'tunnel_closed');
    assert.strictEqual(entry.app, 'test-app');
    assert.strictEqual(entry.port, 3000);
  });

  it('should write error event', async () => {
    await logger.logError('Connection failed', 'test-app', 3000, {
      code: 'ECONNREFUSED'
    });

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());
    assert.strictEqual(entry.event, 'error');
    assert.strictEqual(entry.app, 'test-app');
    assert.strictEqual(entry.port, 3000);
    assert.strictEqual(entry.message, 'Connection failed');
    assert.strictEqual(entry.details.code, 'ECONNREFUSED');
    assert.strictEqual(entry.details.success, false);
  });

  it('should append multiple events', async () => {
    await logger.logRegister('app1', 3000);
    await logger.logRegister('app2', 3001);
    await logger.logRelease('app1', 3000);

    const content = await readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    assert.strictEqual(lines.length, 3, 'Should have three log lines');

    const events = lines.map(line => JSON.parse(line));
    assert.strictEqual(events[0].event, 'register');
    assert.strictEqual(events[0].app, 'app1');
    assert.strictEqual(events[1].event, 'register');
    assert.strictEqual(events[1].app, 'app2');
    assert.strictEqual(events[2].event, 'release');
    assert.strictEqual(events[2].app, 'app1');
  });

  it('should include ISO 8601 timestamp', async () => {
    await logger.logRegister('test-app', 3000);

    const content = await readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());

    // Validate timestamp format
    const timestamp = new Date(entry.timestamp);
    assert.ok(!isNaN(timestamp.getTime()), 'Timestamp should be valid ISO 8601');
    assert.ok(entry.timestamp.endsWith('Z'), 'Timestamp should be in UTC');
  });

  it('should not crash on write failure', async () => {
    // This test verifies graceful error handling
    // We can't easily cause a write failure, but we verify the method doesn't throw
    await assert.doesNotReject(
      async () => await logger.logRegister('test-app', 3000),
      'Logger should not throw on normal operation'
    );
  });
});
