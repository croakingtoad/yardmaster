/**
 * Tests for NgrokManager
 *
 * Unit tests cover state-management logic that doesn't require a real ngrok
 * auth token.  Integration tests (marked [integration]) require NGROK_AUTH_TOKEN
 * to be set and will hit ngrok's API — skip them in CI without the token.
 */

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from './logger.js';
import { NgrokManager, type NgrokSdk } from './ngrok-manager.js';
import type { Config } from './types/index.js';

function makeConfig(authToken = 'dummy-token'): Config {
  return {
    port_range: { start: 4000, end: 4100 },
    ngrok: { auth_token: authToken, region: 'us' },
    registry: { path: '~/.yardmaster/registry.json' },
    server: { name: 'test', version: '1.0.0', description: '' }
  };
}

let tmpDir: string;
let activityLogger: Logger;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yardmaster-ngrok-test-'));
  activityLogger = new Logger(join(tmpDir, 'logs', 'activity.log'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeManager(config: Config, sdk?: NgrokSdk): NgrokManager {
  return new NgrokManager(config, sdk, activityLogger);
}

// ---------------------------------------------------------------------------
// Pure state-management (no network required)
// ---------------------------------------------------------------------------

describe('NgrokManager — state management (no network)', () => {
  it('starts with no active tunnels', () => {
    const mgr = makeManager(makeConfig());
    assert.strictEqual(mgr.getTunnelCount(), 0);
    assert.deepStrictEqual(mgr.listActiveTunnels(), []);
  });

  it('hasTunnel returns false for unknown app', () => {
    const mgr = makeManager(makeConfig());
    assert.strictEqual(mgr.hasTunnel('ghost'), false);
  });

  it('getTunnelUrl returns null for unknown app', () => {
    const mgr = makeManager(makeConfig());
    assert.strictEqual(mgr.getTunnelUrl('nobody'), null);
  });

  it('closeTunnel does not throw when tunnel does not exist', async () => {
    const mgr = makeManager(makeConfig());
    await assert.doesNotReject(
      async () => await mgr.closeTunnel('nonexistent'),
      'closeTunnel should be a no-op when tunnel is absent'
    );
  });

  it('shutdown resolves cleanly when no tunnels are active', async () => {
    const mgr = makeManager(makeConfig());
    await assert.doesNotReject(async () => await mgr.shutdown());
  });

  it('initialize throws a descriptive error when auth token is missing', async () => {
    const mgr = makeManager(makeConfig(''));
    await assert.rejects(
      async () => await mgr.initialize(),
      /ngrok auth token is required to create tunnels/
    );
  });

  it('initialize is idempotent — second call does nothing', async () => {
    let authTokenCalls = 0;
    const sdk: NgrokSdk = {
      async authtoken(): Promise<void> {
        authTokenCalls += 1;
      },
      async forward(): Promise<never> {
        throw new Error('forward should not be called by initialize()');
      }
    };
    const mgr = makeManager(makeConfig(), sdk);

    await mgr.initialize();
    await mgr.initialize();

    assert.strictEqual(authTokenCalls, 1);
  });
});

// ---------------------------------------------------------------------------
// Config path coverage
// ---------------------------------------------------------------------------

describe('NgrokManager — constructor config paths', () => {
  it('accepts config with domain, basic_auth, ip_allow, ip_deny', () => {
    const cfg = makeConfig();
    cfg.ngrok.domain = 'myapp.ngrok.app';
    cfg.ngrok.basic_auth = 'user:pass';
    cfg.ngrok.ip_allow = ['10.0.0.0/8'];
    cfg.ngrok.ip_deny = ['203.0.113.0/24'];
    assert.doesNotThrow(() => makeManager(cfg));
  });
});

// ---------------------------------------------------------------------------
// Integration tests — require real NGROK_AUTH_TOKEN
// Skip these in CI when token is absent by checking env var upfront.
// ---------------------------------------------------------------------------

const INTEGRATION_CASE_COUNT = 5;
const HAVE_TOKEN = Boolean(process.env.NGROK_AUTH_TOKEN);
const REQUIRE_INTEGRATION =
  process.env.YARDMASTER_REQUIRE_NGROK_INTEGRATION === '1';
const INTEGRATION_SKIP_REASON = HAVE_TOKEN
  ? false
  : 'NGROK integration NOT RUN: NGROK_AUTH_TOKEN is not set';

if (!HAVE_TOKEN && REQUIRE_INTEGRATION) {
  it('requires ngrok integration credentials when explicitly requested', () => {
    assert.fail(
      'YARDMASTER_REQUIRE_NGROK_INTEGRATION=1, but NGROK_AUTH_TOKEN is not set'
    );
  });
} else if (!HAVE_TOKEN) {
  console.warn(
    `WARNING: ngrok integration coverage DID NOT RUN: ${INTEGRATION_CASE_COUNT} cases skipped because NGROK_AUTH_TOKEN is not set`
  );
}

describe('NgrokManager — integration (real ngrok)', () => {
  // NOTE: These tests create real ngrok tunnels and will consume quota.

  it(
    'createTunnel returns a public HTTPS URL',
    { skip: INTEGRATION_SKIP_REASON },
    async () => {
      const mgr = makeManager(makeConfig(process.env.NGROK_AUTH_TOKEN!));
      const url = await mgr.createTunnel(4000, 'int-test-app');
      assert.ok(url.startsWith('https://'), `Expected HTTPS URL, got: ${url}`);
      assert.strictEqual(mgr.hasTunnel('int-test-app'), true);
      assert.strictEqual(mgr.getTunnelUrl('int-test-app'), url);
      assert.strictEqual(mgr.getTunnelCount(), 1);
      await mgr.closeTunnel('int-test-app');
    }
  );

  it(
    'createTunnel returns existing URL without creating a new tunnel',
    { skip: INTEGRATION_SKIP_REASON },
    async () => {
      const mgr = makeManager(makeConfig(process.env.NGROK_AUTH_TOKEN!));
      const url1 = await mgr.createTunnel(4000, 'dedup-app');
      const url2 = await mgr.createTunnel(4000, 'dedup-app');
      assert.strictEqual(url1, url2);
      assert.strictEqual(mgr.getTunnelCount(), 1);
      await mgr.closeTunnel('dedup-app');
    }
  );

  it(
    'closeTunnel removes the tunnel and decrements count',
    { skip: INTEGRATION_SKIP_REASON },
    async () => {
      const mgr = makeManager(makeConfig(process.env.NGROK_AUTH_TOKEN!));
      await mgr.createTunnel(4000, 'close-me');
      assert.strictEqual(mgr.getTunnelCount(), 1);
      await mgr.closeTunnel('close-me');
      assert.strictEqual(mgr.getTunnelCount(), 0);
      assert.strictEqual(mgr.hasTunnel('close-me'), false);
    }
  );

  it(
    'shutdown closes all active tunnels',
    { skip: INTEGRATION_SKIP_REASON },
    async () => {
      const mgr = makeManager(makeConfig(process.env.NGROK_AUTH_TOKEN!));
      await mgr.createTunnel(4001, 'app-1');
      await mgr.createTunnel(4002, 'app-2');
      assert.strictEqual(mgr.getTunnelCount(), 2);
      await mgr.shutdown();
      assert.strictEqual(mgr.getTunnelCount(), 0);
    }
  );

  it(
    'initialize throws a descriptive error for an invalid auth token',
    { skip: INTEGRATION_SKIP_REASON },
    async () => {
      const mgr = makeManager(makeConfig('invalid-token-xyz'));
      await assert.rejects(
        async () => await mgr.initialize(),
        /Failed to initialize ngrok/
      );
    }
  );
});
