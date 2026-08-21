/**
 * Tests for configuration loading and validation
 * Zero Mock Policy: Real file I/O with temp directories
 */

import './test-entrypoint.js';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { loadConfig } from './config.js';

// Capture and restore env vars around each test
const WATCHED_VARS = [
  'NGROK_AUTH_TOKEN',
  'NGROK_DOMAIN',
  'NGROK_BASIC_AUTH',
  'NGROK_IP_ALLOW',
  'NGROK_IP_DENY',
  'PORT_RANGE_START',
  'PORT_RANGE_END'
];

let savedEnv: Record<string, string | undefined> = {};

function clearEnv() {
  for (const key of WATCHED_VARS) {
    delete process.env[key];
  }
}

beforeEach(() => {
  for (const key of WATCHED_VARS) {
    savedEnv[key] = process.env[key];
  }
  clearEnv();
});

afterEach(() => {
  for (const key of WATCHED_VARS) {
    if (savedEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = savedEnv[key];
    }
  }
});

// ---------------------------------------------------------------------------
// Default config
// ---------------------------------------------------------------------------

describe('loadConfig() — defaults', () => {
  it('loads successfully with no user config and no env overrides', async () => {
    const config = await loadConfig();
    assert.ok(config.port_range.start >= 1024);
    assert.ok(config.port_range.end <= 65535);
    assert.ok(config.port_range.start < config.port_range.end);
    assert.ok(config.registry.path);
  });

  it('returns a port_range with start < end', async () => {
    const config = await loadConfig();
    assert.ok(config.port_range.start < config.port_range.end);
  });
});

// ---------------------------------------------------------------------------
// Env var overrides
// ---------------------------------------------------------------------------

describe('loadConfig() — env var overrides', () => {
  it('NGROK_AUTH_TOKEN overrides the default token', async () => {
    process.env.NGROK_AUTH_TOKEN = 'override-token-abc123';
    const config = await loadConfig();
    assert.strictEqual(config.ngrok.auth_token, 'override-token-abc123');
  });

  it('NGROK_DOMAIN sets the domain field', async () => {
    process.env.NGROK_DOMAIN = 'myapp.ngrok.app';
    const config = await loadConfig();
    assert.strictEqual(config.ngrok.domain, 'myapp.ngrok.app');
  });

  it('NGROK_BASIC_AUTH sets basic_auth when valid', async () => {
    process.env.NGROK_BASIC_AUTH = 'alice:s3cr3t';
    const config = await loadConfig();
    assert.strictEqual(config.ngrok.basic_auth, 'alice:s3cr3t');
  });

  it('NGROK_BASIC_AUTH throws on invalid format', async () => {
    process.env.NGROK_BASIC_AUTH = 'nopassword';
    await assert.rejects(
      async () => await loadConfig(),
      /Invalid NGROK_BASIC_AUTH/
    );
  });

  it('NGROK_IP_ALLOW sets allowed CIDRs', async () => {
    process.env.NGROK_IP_ALLOW = '10.0.0.0/8,192.168.0.0/16';
    const config = await loadConfig();
    assert.deepStrictEqual(config.ngrok.ip_allow, ['10.0.0.0/8', '192.168.0.0/16']);
  });

  it('NGROK_IP_ALLOW throws when ALL entries are invalid', async () => {
    process.env.NGROK_IP_ALLOW = 'notanip,alsonotanip';
    await assert.rejects(
      async () => await loadConfig(),
      /Invalid NGROK_IP_ALLOW/
    );
  });

  it('NGROK_IP_DENY sets denied CIDRs', async () => {
    process.env.NGROK_IP_DENY = '203.0.113.0/24';
    const config = await loadConfig();
    assert.deepStrictEqual(config.ngrok.ip_deny, ['203.0.113.0/24']);
  });

  it('PORT_RANGE_START overrides the start of the port range', async () => {
    process.env.PORT_RANGE_START = '5000';
    const config = await loadConfig();
    assert.strictEqual(config.port_range.start, 5000);
  });

  it('PORT_RANGE_END overrides the end of the port range', async () => {
    process.env.PORT_RANGE_END = '6000';
    const config = await loadConfig();
    assert.strictEqual(config.port_range.end, 6000);
  });
});

// ---------------------------------------------------------------------------
// validateConfig() — reached through loadConfig()
// ---------------------------------------------------------------------------

describe('loadConfig() — config validation', () => {
  it('loads successfully without an ngrok auth token (tunnels are opt-in)', async () => {
    process.env.NGROK_AUTH_TOKEN = '';
    // Missing token must not block startup; it is only required when a
    // tunnel is actually requested (NgrokManager.initialize)
    await assert.doesNotReject(async () => await loadConfig());
  });

  it('throws when PORT_RANGE_START > PORT_RANGE_END', async () => {
    process.env.PORT_RANGE_START = '9000';
    process.env.PORT_RANGE_END = '8000';
    await assert.rejects(
      async () => await loadConfig(),
      /start must be less than end/i
    );
  });

  it('throws when PORT_RANGE_START < 1024', async () => {
    process.env.PORT_RANGE_START = '80';
    await assert.rejects(
      async () => await loadConfig(),
      /Invalid port range/i
    );
  });

  it('throws when PORT_RANGE_END > 65535', async () => {
    process.env.PORT_RANGE_END = '99999';
    await assert.rejects(
      async () => await loadConfig(),
      /Invalid port range/i
    );
  });
});
