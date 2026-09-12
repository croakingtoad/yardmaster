/**
 * Tests for PortRegistry
 * Zero Mock Policy: Real file I/O with temp registry files
 */

import './test-entrypoint.js';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';
import { Logger } from './logger.js';
import { PortRegistry } from './registry.js';
import type { Config, PortRegistrationResult } from './types/index.js';

const REGISTRY_WORKER_SOURCE = `
const { PortRegistry } = await import(process.env.YARDMASTER_REGISTRY_MODULE_URL);
const { Logger } = await import(process.env.YARDMASTER_LOGGER_MODULE_URL);

const config = JSON.parse(process.env.YARDMASTER_REGISTRY_CONFIG);
const registry = new PortRegistry(
  config,
  new Logger(process.env.YARDMASTER_WORKER_LOG_PATH)
);

try {
  await registry.initialize();
  process.send({ type: 'ready' });
  process.once('message', async (message) => {
    if (message !== 'start') return;
    try {
      const result = await registry.registerPort(
        process.env.YARDMASTER_WORKER_APP,
        Number(process.env.YARDMASTER_WORKER_PORT)
      );
      process.send({ type: 'result', result }, () => process.disconnect());
    } catch (error) {
      process.send(
        { type: 'error', error: error instanceof Error ? error.message : String(error) },
        () => process.disconnect()
      );
    }
  });
} catch (error) {
  process.send(
    { type: 'error', error: error instanceof Error ? error.message : String(error) },
    () => process.disconnect()
  );
}
`;

interface RegistryWorker {
  process: ChildProcess;
  ready: Promise<void>;
  result: Promise<PortRegistrationResult>;
}

function isPortRegistrationResult(value: unknown): value is PortRegistrationResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'success' in value &&
    typeof value.success === 'boolean' &&
    'app_name' in value &&
    typeof value.app_name === 'string' &&
    'port' in value &&
    typeof value.port === 'number' &&
    'ngrok_url' in value &&
    typeof value.ngrok_url === 'string'
  );
}

function startRegistryWorker(
  workerConfig: Config,
  appName: string,
  port: number
): RegistryWorker {
  const child = spawn(
    process.execPath,
    ['--input-type=module', '--eval', REGISTRY_WORKER_SOURCE],
    {
      env: {
        ...process.env,
        YARDMASTER_REGISTRY_MODULE_URL: pathToFileURL(
          join(process.cwd(), 'dist', 'registry.js')
        ).href,
        YARDMASTER_LOGGER_MODULE_URL: pathToFileURL(
          join(process.cwd(), 'dist', 'logger.js')
        ).href,
        YARDMASTER_REGISTRY_CONFIG: JSON.stringify(workerConfig),
        YARDMASTER_WORKER_APP: appName,
        YARDMASTER_WORKER_PORT: String(port),
        YARDMASTER_WORKER_LOG_PATH: join(
          dirname(workerConfig.registry.path),
          `${appName}.activity.log`
        )
      },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc']
    }
  );

  let stderr = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderr += chunk;
  });

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  let resolveResult!: (result: PortRegistrationResult) => void;
  let rejectResult!: (error: Error) => void;
  const result = new Promise<PortRegistrationResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  child.on('message', (message: unknown) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      return;
    }
    if (message.type === 'ready') {
      resolveReady();
    } else if (
      message.type === 'result' &&
      'result' in message &&
      isPortRegistrationResult(message.result)
    ) {
      resolveResult(message.result);
    } else if (message.type === 'error' && 'error' in message) {
      const error = new Error(`registry worker failed: ${String(message.error)}`);
      rejectReady(error);
      rejectResult(error);
    }
  });

  child.once('error', (error) => {
    rejectReady(error);
    rejectResult(error);
  });
  child.once('exit', (code, signal) => {
    if (code === 0) return;
    const error = new Error(
      `registry worker exited with code ${code}, signal ${signal}: ${stderr}`
    );
    rejectReady(error);
    rejectResult(error);
  });

  return { process: child, ready, result };
}

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
let activityLogger: Logger;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'yardmaster-test-'));
  config = makeConfig(tmpDir);
  activityLogger = new Logger(join(tmpDir, 'logs', 'activity.log'));
  registry = new PortRegistry(config, activityLogger);
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
    await registry.registerPort(
      'preexisting',
      4000,
      undefined,
      'keep this note'
    );

    // Create a new instance pointing at the same file
    const registry2 = new PortRegistry(config, activityLogger);
    await registry2.initialize();

    const reg = registry2.getRegistrationByApp('preexisting');
    assert.ok(reg, 'Preexisting registration should survive re-init');
    assert.strictEqual(reg!.port, 4000);
    assert.strictEqual(reg!.notes, 'keep this note');
  });

  for (const [name, invalidRegistry] of [
    ['unparseable JSON', '{not-json'],
    ['JSON with an invalid registry shape', '{}']
  ]) {
    it(`rejects ${name} without overwriting it`, async () => {
      await writeFile(config.registry.path, invalidRegistry, 'utf8');
      const freshRegistry = new PortRegistry(config, activityLogger);

      await assert.rejects(async () => await freshRegistry.initialize());
      assert.strictEqual(
        await readFile(config.registry.path, 'utf8'),
        invalidRegistry
      );
    });
  }
});

// ---------------------------------------------------------------------------
// cross-process transactions
// ---------------------------------------------------------------------------

describe('PortRegistry cross-process transactions', () => {
  it('preserves every update from independently initialized processes', async () => {
    const workers = [
      startRegistryWorker(config, 'worker-a', 4000),
      startRegistryWorker(config, 'worker-b', 4001)
    ];

    try {
      await Promise.all(workers.map(async (worker) => await worker.ready));
      for (const worker of workers) {
        assert.strictEqual(worker.process.send('start'), true);
      }

      const results = await Promise.all(
        workers.map(async (worker) => await worker.result)
      );
      assert.ok(results.every((result) => result.success));

      const persisted: unknown = JSON.parse(
        await readFile(config.registry.path, 'utf8')
      );
      assert.ok(typeof persisted === 'object' && persisted !== null);
      assert.ok('ports' in persisted);
      assert.ok(typeof persisted.ports === 'object' && persisted.ports !== null);
      assert.ok('version' in persisted);
      assert.strictEqual(persisted.version, '1.0.0');
      assert.ok('last_updated' in persisted);
      assert.ok(typeof persisted.last_updated === 'string');
      assert.ok(!Number.isNaN(Date.parse(persisted.last_updated)));
      assert.deepStrictEqual(Object.keys(persisted.ports).sort(), ['4000', '4001']);

      for (const [port, appName] of [
        ['4000', 'worker-a'],
        ['4001', 'worker-b']
      ]) {
        const registration: unknown = (
          persisted.ports as Record<string, unknown>
        )[port];
        assert.ok(typeof registration === 'object' && registration !== null);
        assert.ok('app_name' in registration);
        assert.strictEqual(registration.app_name, appName);
        assert.ok('port' in registration);
        assert.strictEqual(registration.port, Number(port));
        assert.ok('status' in registration);
        assert.strictEqual(registration.status, 'active');
        assert.ok('registered_at' in registration);
        assert.ok(typeof registration.registered_at === 'string');
        assert.ok(!Number.isNaN(Date.parse(registration.registered_at)));
      }
    } finally {
      for (const worker of workers) {
        if (worker.process.exitCode === null && worker.process.signalCode === null) {
          worker.process.kill();
        }
      }
    }
  });

  it('reloads fresh state for every mutation and reconciles the instance', async () => {
    await registry.registerPort('target', 4000);

    const urlWriter = new PortRegistry(config, activityLogger);
    await urlWriter.initialize();
    await registry.registerPort('peer-before-url', 4001);
    await urlWriter.updateNgrokUrl('target', 'https://target.ngrok.io');
    assert.strictEqual(urlWriter.queryPorts().total, 2);
    assert.strictEqual(
      urlWriter.getRegistrationByApp('target')?.ngrok_url,
      'https://target.ngrok.io'
    );

    const monitorWriter = new PortRegistry(config, activityLogger);
    await monitorWriter.initialize();
    await registry.registerPort('peer-before-monitor', 4002);
    assert.strictEqual(await monitorWriter.setMonitor('target', true), true);
    assert.strictEqual(monitorWriter.queryPorts().total, 3);
    assert.strictEqual(
      monitorWriter.getRegistrationByApp('target')?.monitor,
      true
    );

    const releaseWriter = new PortRegistry(config, activityLogger);
    await releaseWriter.initialize();
    await registry.registerPort('peer-before-release', 4003);
    assert.strictEqual((await releaseWriter.releasePort('target')).success, true);
    assert.strictEqual(releaseWriter.queryPorts().total, 3);
    assert.strictEqual(releaseWriter.getRegistrationByApp('target'), null);

    const persisted = new PortRegistry(config, activityLogger);
    await persisted.initialize();
    assert.deepStrictEqual(
      persisted
        .queryPorts()
        .registrations.map((registration) => registration.app_name)
        .sort(),
      ['peer-before-monitor', 'peer-before-release', 'peer-before-url']
    );
    assert.strictEqual(
      persisted.getRegistrationByPort(4000),
      null,
      'released registrations remain persisted but inactive'
    );
  });
});

// ---------------------------------------------------------------------------
// registerPort()
// ---------------------------------------------------------------------------

describe('PortRegistry.registerPort()', () => {
  it('surfaces degraded logging without failing the registration', async () => {
    const degradedRegistry = new PortRegistry(config, new Logger(tmpDir));
    await degradedRegistry.initialize();

    const result = await degradedRegistry.registerPort('audit-degraded', 4000);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.activity_log?.status, 'degraded');
    assert.ok(degradedRegistry.getRegistrationByApp('audit-degraded'));
  });

  it('registers a specific port successfully', async () => {
    const result = await registry.registerPort(
      'app-a',
      4001,
      undefined,
      'local API'
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.port, 4001);
    assert.strictEqual(result.app_name, 'app-a');
    assert.strictEqual(
      registry.getRegistrationByApp('app-a')?.notes,
      'local API'
    );
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
// setNotes()
// ---------------------------------------------------------------------------

describe('PortRegistry.setNotes()', () => {
  it('updates notes without changing or releasing the registration', async () => {
    await registry.registerPort('documented', 4009, true, 'old note');
    const before = registry.getRegistrationByApp('documented');
    assert.ok(before);

    await registry.setNotes('documented', 'new note');

    const after = registry.getRegistrationByApp('documented');
    assert.ok(after);
    assert.strictEqual(after.port, before.port);
    assert.strictEqual(after.registered_at, before.registered_at);
    assert.strictEqual(after.status, 'active');
    assert.strictEqual(after.monitor, true);
    assert.strictEqual(after.notes, 'new note');
    assert.strictEqual(registry.isPortAvailable(4009), false);
  });

  it('persists null notes through the locked mutation path', async () => {
    await registry.registerPort('clear-note', 4009, undefined, 'temporary');
    await registry.setNotes('clear-note', null);

    const reloaded = new PortRegistry(config, activityLogger);
    await reloaded.initialize();
    assert.strictEqual(reloaded.getRegistrationByApp('clear-note')?.notes, null);
  });

  it('rejects an unknown app without creating a registration', async () => {
    await assert.rejects(
      async () => await registry.setNotes('missing', 'note'),
      /No active registration found for 'missing'/
    );
    assert.strictEqual(registry.getRegistrationByApp('missing'), null);
  });

  it('rejects a released app without restoring its reservation', async () => {
    await registry.registerPort('released', 4009);
    await registry.releasePort('released');

    await assert.rejects(
      async () => await registry.setNotes('released', 'note'),
      /No active registration found for 'released'/
    );
    assert.strictEqual(registry.getRegistrationByApp('released'), null);
    assert.strictEqual(registry.isPortAvailable(4009), true);
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
