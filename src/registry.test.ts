/**
 * Tests for PortRegistry
 * Zero Mock Policy: Real file I/O with temp registry files
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PortRegistry } from './registry.js';
import type { Config } from './types/index.js';

// Build a minimal config that points at an isolated temp directory
function makeConfig(registryDir: string): Config {
  return {
    port_range: { start: 4000, end: 4010 },
    ngrok: { auth_token: 'test-token', region: 'us' },
    registry: { path: join(registryDir, 'registry.json') },
    server: { name: 'test', version: '1.0.0', description: 'test' }
  };
}

let tmpDir: string;
let config: Config;
let registry: PortRegistry;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yardmaster-test-'));
  config = makeConfig(tmpDir);
  registry = new PortRegistry(config);
  await registry.initialize();
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// initialize()
// ---------------------------------------------------------------------------

describe('PortRegistry.initialize()', () => {
  it('creates a fresh registry file when none exists', () => {
    const data = registry.getData();
    assert.strictEqual(typeof data.version, 'string');
    assert.deepStrictEqual(data.ports, {});
  });

  it('loads an existing registry without overwriting it', async () => {
    await registry.registerPort('preexisting', 4000);

    // Create a new instance pointing at the same file
    const registry2 = new PortRegistry(config);
    await registry2.initialize();

    const reg = registry2.getRegistrationByApp('preexisting');
    assert.ok(reg, 'Preexisting registration should survive re-init');
    assert.strictEqual(reg!.port, 4000);
  });
});

// ---------------------------------------------------------------------------
// registerPort()
// ---------------------------------------------------------------------------

describe('PortRegistry.registerPort()', () => {
  it('registers a specific port successfully', async () => {
    const result = await registry.registerPort('app-a', 4001);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.port, 4001);
    assert.strictEqual(result.app_name, 'app-a');
  });

  it('auto-assigns a port when none specified', async () => {
    const result = await registry.registerPort('app-auto');
    assert.strictEqual(result.success, true);
    assert.ok(result.port >= 4000 && result.port <= 4010);
  });

  it('rejects when app is already registered', async () => {
    await registry.registerPort('dup-app', 4002);
    const second = await registry.registerPort('dup-app', 4003);
    assert.strictEqual(second.success, false);
    assert.ok(second.message?.includes('already registered'));
  });

  it('rejects an invalid port number (below 1024)', async () => {
    const result = await registry.registerPort('app-bad', 80);
    assert.strictEqual(result.success, false);
    assert.ok(result.message?.includes('Invalid port'));
  });

  it('rejects an invalid port number (above 65535)', async () => {
    const result = await registry.registerPort('app-bad', 99999);
    assert.strictEqual(result.success, false);
    assert.ok(result.message?.includes('Invalid port'));
  });

  it('rejects a port already in use by another app', async () => {
    await registry.registerPort('app-owner', 4005);
    const result = await registry.registerPort('app-contender', 4005);
    assert.strictEqual(result.success, false);
    assert.ok(result.message?.includes('already in use'));
    assert.ok(result.message?.includes('app-owner'));
  });

  it('fails gracefully when the port range is exhausted', async () => {
    // Fill every port in the narrow range 4000-4010 (11 ports)
    for (let p = 4000; p <= 4010; p++) {
      await registry.registerPort(`filler-${p}`, p);
    }
    const overflow = await registry.registerPort('no-room');
    assert.strictEqual(overflow.success, false);
    assert.ok(overflow.message?.includes('No available ports'));
  });

  it('allows re-registering a previously released port', async () => {
    await registry.registerPort('temp-app', 4007);
    await registry.releasePort('temp-app');
    const result = await registry.registerPort('new-app', 4007);
    assert.strictEqual(result.success, true);
  });
});

// ---------------------------------------------------------------------------
// updateNgrokUrl()
// ---------------------------------------------------------------------------

describe('PortRegistry.updateNgrokUrl()', () => {
  it('sets the ngrok URL for an active registration', async () => {
    await registry.registerPort('tunneled', 4008);
    await registry.updateNgrokUrl('tunneled', 'https://abc.ngrok.io');
    const reg = registry.getRegistrationByApp('tunneled');
    assert.strictEqual(reg!.ngrok_url, 'https://abc.ngrok.io');
  });

  it('does nothing when app is not registered', async () => {
    // Should not throw
    await assert.doesNotReject(
      async () => await registry.updateNgrokUrl('ghost', 'https://x.ngrok.io')
    );
  });
});

// ---------------------------------------------------------------------------
// setMonitor()
// ---------------------------------------------------------------------------

describe('PortRegistry.setMonitor()', () => {
  it('enables monitoring on a registered app', async () => {
    await registry.registerPort('watch-me', 4009);
    const ok = await registry.setMonitor('watch-me', true);
    assert.strictEqual(ok, true);
    const reg = registry.getRegistrationByApp('watch-me');
    assert.strictEqual(reg!.monitor, true);
  });

  it('disables monitoring on a registered app', async () => {
    await registry.registerPort('watch-me', 4009);
    await registry.setMonitor('watch-me', true);
    await registry.setMonitor('watch-me', false);
    const reg = registry.getRegistrationByApp('watch-me');
    assert.strictEqual(reg!.monitor, false);
  });

  it('returns false when app does not exist', async () => {
    const ok = await registry.setMonitor('phantom', true);
    assert.strictEqual(ok, false);
  });
});

// ---------------------------------------------------------------------------
// releasePort()
// ---------------------------------------------------------------------------

describe('PortRegistry.releasePort()', () => {
  it('releases an active registration', async () => {
    await registry.registerPort('to-release', 4000);
    const result = await registry.releasePort('to-release');
    assert.strictEqual(result.success, true);
    assert.ok(result.message?.includes('Released'));
  });

  it('marks the registration as released (not deleted)', async () => {
    await registry.registerPort('to-release', 4000);
    await registry.releasePort('to-release');
    // queryPorts only shows active — released should not appear
    const q = registry.queryPorts();
    assert.strictEqual(q.total, 0);
  });

  it('returns failure when app is not registered', async () => {
    const result = await registry.releasePort('nobody');
    assert.strictEqual(result.success, false);
    assert.ok(result.message?.includes('No active registration'));
  });

  it('cannot release the same app twice', async () => {
    await registry.registerPort('once', 4001);
    await registry.releasePort('once');
    const second = await registry.releasePort('once');
    assert.strictEqual(second.success, false);
  });
});

// ---------------------------------------------------------------------------
// queryPorts()
// ---------------------------------------------------------------------------

describe('PortRegistry.queryPorts()', () => {
  it('returns only active registrations by default', async () => {
    await registry.registerPort('active', 4000);
    await registry.registerPort('to-free', 4001);
    await registry.releasePort('to-free');

    const result = registry.queryPorts();
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.registrations[0].app_name, 'active');
  });

  it('filters by partial app name (case insensitive)', async () => {
    await registry.registerPort('frontend', 4000);
    await registry.registerPort('backend', 4001);

    const result = registry.queryPorts('FRONT');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.registrations[0].app_name, 'frontend');
  });

  it('filters by port number string', async () => {
    await registry.registerPort('app1', 4002);
    await registry.registerPort('app2', 4003);

    const result = registry.queryPorts('4002');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.registrations[0].port, 4002);
  });

  it('returns empty when filter matches nothing', async () => {
    await registry.registerPort('myapp', 4000);
    const result = registry.queryPorts('zzznomatch');
    assert.strictEqual(result.total, 0);
  });

  it('returns empty when registry is empty', () => {
    const result = registry.queryPorts();
    assert.strictEqual(result.total, 0);
  });
});

// ---------------------------------------------------------------------------
// getAvailablePort()
// ---------------------------------------------------------------------------

describe('PortRegistry.getAvailablePort()', () => {
  it('returns the first port in range when all are free', () => {
    const port = registry.getAvailablePort();
    assert.strictEqual(port, 4000);
  });

  it('skips occupied ports', async () => {
    await registry.registerPort('occupier', 4000);
    const port = registry.getAvailablePort();
    assert.strictEqual(port, 4001);
  });

  it('respects custom range parameters', () => {
    const port = registry.getAvailablePort(4005, 4005);
    assert.strictEqual(port, 4005);
  });

  it('returns null when range is fully occupied', async () => {
    for (let p = 4000; p <= 4010; p++) {
      await registry.registerPort(`filler-${p}`, p);
    }
    const port = registry.getAvailablePort();
    assert.strictEqual(port, null);
  });
});

// ---------------------------------------------------------------------------
// isPortAvailable() / isValidPort()
// ---------------------------------------------------------------------------

describe('PortRegistry.isPortAvailable()', () => {
  it('returns true for an unregistered port', () => {
    assert.strictEqual(registry.isPortAvailable(4000), true);
  });

  it('returns false for an actively registered port', async () => {
    await registry.registerPort('blocker', 4000);
    assert.strictEqual(registry.isPortAvailable(4000), false);
  });

  it('returns true after a port has been released', async () => {
    await registry.registerPort('temp', 4000);
    await registry.releasePort('temp');
    assert.strictEqual(registry.isPortAvailable(4000), true);
  });
});

describe('PortRegistry.isValidPort()', () => {
  it('accepts 1024', () => assert.strictEqual(registry.isValidPort(1024), true));
  it('accepts 65535', () => assert.strictEqual(registry.isValidPort(65535), true));
  it('rejects 1023', () => assert.strictEqual(registry.isValidPort(1023), false));
  it('rejects 65536', () => assert.strictEqual(registry.isValidPort(65536), false));
  it('rejects 0', () => assert.strictEqual(registry.isValidPort(0), false));
  it('rejects negative', () => assert.strictEqual(registry.isValidPort(-1), false));
});

// ---------------------------------------------------------------------------
// getRegistrationByApp() / getRegistrationByPort()
// ---------------------------------------------------------------------------

describe('PortRegistry.getRegistrationByApp()', () => {
  it('returns registration for active app', async () => {
    await registry.registerPort('lookup-app', 4004);
    const reg = registry.getRegistrationByApp('lookup-app');
    assert.ok(reg);
    assert.strictEqual(reg!.port, 4004);
  });

  it('returns null for unknown app', () => {
    assert.strictEqual(registry.getRegistrationByApp('nobody'), null);
  });

  it('returns null for released app', async () => {
    await registry.registerPort('gone', 4004);
    await registry.releasePort('gone');
    assert.strictEqual(registry.getRegistrationByApp('gone'), null);
  });
});

describe('PortRegistry.getRegistrationByPort()', () => {
  it('returns registration for active port', async () => {
    await registry.registerPort('port-lookup', 4006);
    const reg = registry.getRegistrationByPort(4006);
    assert.ok(reg);
    assert.strictEqual(reg!.app_name, 'port-lookup');
  });

  it('returns null for unregistered port', () => {
    assert.strictEqual(registry.getRegistrationByPort(9999), null);
  });

  it('returns null for released port', async () => {
    await registry.registerPort('expired', 4006);
    await registry.releasePort('expired');
    assert.strictEqual(registry.getRegistrationByPort(4006), null);
  });
});
