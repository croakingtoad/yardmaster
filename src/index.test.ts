/**
 * Tests for YardmasterServer (MCP server)
 *
 * Registry behavior is tested directly where appropriate. Server orchestration
 * behavior is exercised through a real in-memory MCP client/server transport.
 */

import './test-entrypoint.js';

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { YardmasterServer } from './index.js';
import { Logger } from './logger.js';
import { PortRegistry } from './registry.js';
import type { Config } from './types/index.js';

function makeConfig(dir: string, authToken = 'test-token'): Config {
  return {
    port_range: { start: 5100, end: 5120 },
    ngrok: { auth_token: authToken, region: 'us' },
    registry: { path: join(dir, 'registry.json') },
    server: { name: 'test', version: '1.0.0', description: '' }
  };
}

let tmpDir: string;
let registry: PortRegistry;
let clients: Client[];
let activityLogger: Logger;

async function connectClient(server: YardmasterServer): Promise<Client> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'yardmaster-test', version: '1.0.0' });
  await client.connect(clientTransport);
  clients.push(client);
  return client;
}

function getTextContent(result: unknown): string {
  if (
    typeof result !== 'object' ||
    result === null ||
    !('content' in result) ||
    !Array.isArray(result.content)
  ) {
    throw new Error('Expected a tool response with content');
  }

  const content = result.content[0];
  if (
    typeof content !== 'object' ||
    content === null ||
    !('type' in content) ||
    content.type !== 'text' ||
    !('text' in content) ||
    typeof content.text !== 'string'
  ) {
    throw new Error('Expected text tool response content');
  }
  return content.text;
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'ym-server-test-'));
  activityLogger = new Logger(join(tmpDir, 'logs', 'activity.log'));
  registry = new PortRegistry(makeConfig(tmpDir), activityLogger);
  await registry.initialize();
  clients = [];
});

afterEach(async () => {
  await Promise.all(clients.map(async (client) => await client.close()));
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// notes MCP surface
// ---------------------------------------------------------------------------

describe('notes MCP surface', () => {
  it('advertises note-aware tool schemas and query guidance', async () => {
    const server = new YardmasterServer(activityLogger);
    const client = await connectClient(server);
    const { tools } = await client.listTools();

    const registerTool = tools.find((tool) => tool.name === 'register_port');
    assert.ok(registerTool?.inputSchema.properties?.notes);
    assert.ok(!registerTool.inputSchema.required?.includes('notes'));

    const annotateTool = tools.find((tool) => tool.name === 'annotate_port');
    assert.ok(annotateTool?.inputSchema.properties?.app_name);
    assert.ok(annotateTool.inputSchema.properties.notes);
    assert.deepStrictEqual(annotateTool.inputSchema.required, [
      'app_name',
      'notes'
    ]);

    const queryTool = tools.find((tool) => tool.name === 'query_ports');
    assert.match(queryTool?.description ?? '', /hostname\/exposure/i);
  });

  it('persists register_port notes and returns them from query_ports', async () => {
    const server = new YardmasterServer(activityLogger);
    await server.initialize(makeConfig(tmpDir));
    const client = await connectClient(server);

    const registration = await client.callTool({
      name: 'register_port',
      arguments: {
        app_name: 'documented-app',
        desired_port: 5101,
        notes: 'available at app.example.test'
      }
    });
    assert.strictEqual(registration.isError, undefined);

    const query = await client.callTool({
      name: 'query_ports',
      arguments: { filter: 'documented-app' }
    });
    const result = JSON.parse(getTextContent(query)) as {
      registrations: Array<{ notes?: string | null }>;
    };
    assert.strictEqual(
      result.registrations[0].notes,
      'available at app.example.test'
    );
  });

  it('annotates an active registration without replacing it', async () => {
    const server = new YardmasterServer(activityLogger);
    await server.initialize(makeConfig(tmpDir));
    const client = await connectClient(server);

    await client.callTool({
      name: 'register_port',
      arguments: { app_name: 'stable-app', desired_port: 5102 }
    });
    const beforeQuery = await client.callTool({
      name: 'query_ports',
      arguments: { filter: 'stable-app' }
    });

    const annotation = await client.callTool({
      name: 'annotate_port',
      arguments: { app_name: 'stable-app', notes: 'localhost only' }
    });
    assert.strictEqual(annotation.isError, undefined);

    const afterQuery = await client.callTool({
      name: 'query_ports',
      arguments: { filter: 'stable-app' }
    });
    const before = JSON.parse(getTextContent(beforeQuery)).registrations[0];
    const after = JSON.parse(getTextContent(afterQuery)).registrations[0];
    assert.deepStrictEqual(after, { ...before, notes: 'localhost only' });
  });

  it('returns the registry error when annotating an unknown app', async () => {
    const server = new YardmasterServer(activityLogger);
    await server.initialize(makeConfig(tmpDir));
    const client = await connectClient(server);

    const result = await client.callTool({
      name: 'annotate_port',
      arguments: { app_name: 'missing-app', notes: 'not stored' }
    });

    assert.strictEqual(result.isError, true);
    assert.strictEqual(
      getTextContent(result),
      "Error: No active registration found for 'missing-app'"
    );
  });

  it('rejects invalid annotation notes without changing persisted state', async () => {
    const server = new YardmasterServer(activityLogger);
    const config = makeConfig(tmpDir);
    await server.initialize(config);
    const client = await connectClient(server);

    await client.callTool({
      name: 'register_port',
      arguments: { app_name: 'safe-app', desired_port: 5103 }
    });
    const before = await readFile(config.registry.path, 'utf8');

    for (const notes of [42, { hostname: 'app.example.test' }]) {
      const result = await client.callTool({
        name: 'annotate_port',
        arguments: { app_name: 'safe-app', notes }
      });

      assert.strictEqual(result.isError, true);
      assert.match(getTextContent(result), /notes must be a string or null/i);
      assert.strictEqual(await readFile(config.registry.path, 'utf8'), before);
    }

    const reloaded = new PortRegistry(config, activityLogger);
    await reloaded.initialize();
    assert.strictEqual(
      reloaded.getRegistrationByApp('safe-app')?.notes,
      undefined
    );
  });

  it('rejects invalid registration notes without changing persisted state', async () => {
    const server = new YardmasterServer(activityLogger);
    const config = makeConfig(tmpDir);
    await server.initialize(config);
    const client = await connectClient(server);
    const before = await readFile(config.registry.path, 'utf8');

    const result = await client.callTool({
      name: 'register_port',
      arguments: { app_name: 'poison-app', notes: ['not', 'a', 'string'] }
    });

    assert.strictEqual(result.isError, true);
    assert.match(getTextContent(result), /notes must be a string or null/i);
    assert.strictEqual(await readFile(config.registry.path, 'utf8'), before);

    const reloaded = new PortRegistry(config, activityLogger);
    await reloaded.initialize();
    assert.strictEqual(reloaded.queryPorts().total, 0);
  });

  it('rejects notes longer than 2000 characters before either mutation', async () => {
    const server = new YardmasterServer(activityLogger);
    const config = makeConfig(tmpDir);
    await server.initialize(config);
    const client = await connectClient(server);

    await client.callTool({
      name: 'register_port',
      arguments: { app_name: 'safe-app', desired_port: 5104 }
    });
    const before = await readFile(config.registry.path, 'utf8');
    const notes = 'x'.repeat(2001);

    for (const request of [
      { name: 'annotate_port', arguments: { app_name: 'safe-app', notes } },
      { name: 'register_port', arguments: { app_name: 'other-app', notes } }
    ]) {
      const result = await client.callTool(request);
      assert.strictEqual(result.isError, true);
      assert.match(
        getTextContent(result),
        /notes must not exceed 2000 characters/i
      );
      assert.strictEqual(await readFile(config.registry.path, 'utf8'), before);
    }

    const reloaded = new PortRegistry(config, activityLogger);
    await reloaded.initialize();
    assert.strictEqual(
      reloaded.getRegistrationByApp('safe-app')?.notes,
      undefined
    );
    assert.strictEqual(reloaded.getRegistrationByApp('other-app'), null);
  });
});

// ---------------------------------------------------------------------------
// register_port handler logic (via PortRegistry)
// ---------------------------------------------------------------------------

describe('register_port handler logic', () => {
  it('succeeds and returns port + placeholder ngrok URL', async () => {
    const result = await registry.registerPort('mcp-app', undefined);
    assert.strictEqual(result.success, true);
    assert.ok(result.port >= 5100 && result.port <= 5120);
  });

  it('fails when app is already registered (duplicate)', async () => {
    await registry.registerPort('dup', 5100);
    const second = await registry.registerPort('dup');
    assert.strictEqual(second.success, false);
    assert.ok(second.message?.includes('already registered'));
  });

  it('rollback: port is freed when ngrok tunnel creation fails', async () => {
    const server = new YardmasterServer(activityLogger);
    await server.initialize(makeConfig(tmpDir, ''));
    const client = await connectClient(server);

    const failedRegistration = await client.callTool({
      name: 'register_port',
      arguments: {
        app_name: 'will-rollback',
        desired_port: 5101,
        tunnel: true
      }
    });
    assert.strictEqual(failedRegistration.isError, true);
    assert.match(
      getTextContent(failedRegistration),
      /ngrok auth token is required/
    );

    const query = await client.callTool({
      name: 'query_ports',
      arguments: { filter: 'will-rollback' }
    });
    assert.strictEqual(query.isError, undefined);
    const queryResult = JSON.parse(getTextContent(query)) as { total: number };
    assert.strictEqual(queryResult.total, 0);
  });
});

// ---------------------------------------------------------------------------
// release_port handler logic
// ---------------------------------------------------------------------------

describe('release_port handler logic', () => {
  it('succeeds for a registered app', async () => {
    await registry.registerPort('to-free', 5105);
    const result = await registry.releasePort('to-free');
    assert.strictEqual(result.success, true);
  });

  it('returns failure for an unknown app', async () => {
    const result = await registry.releasePort('ghost');
    assert.strictEqual(result.success, false);
  });
});

// ---------------------------------------------------------------------------
// query_ports handler logic
// ---------------------------------------------------------------------------

describe('query_ports handler logic', () => {
  it('returns all active registrations without a filter', async () => {
    await registry.registerPort('svc-a', 5110);
    await registry.registerPort('svc-b', 5111);
    const result = registry.queryPorts();
    assert.strictEqual(result.total, 2);
  });

  it('filters registrations by name', async () => {
    await registry.registerPort('alpha', 5112);
    await registry.registerPort('beta', 5113);
    const result = registry.queryPorts('alpha');
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.registrations[0].app_name, 'alpha');
  });

  it('returns empty when filter does not match', async () => {
    await registry.registerPort('only-this', 5114);
    const result = registry.queryPorts('zzz');
    assert.strictEqual(result.total, 0);
  });
});

// ---------------------------------------------------------------------------
// get_available_port handler logic
// ---------------------------------------------------------------------------

describe('get_available_port handler logic', () => {
  it('returns a port when one is available', () => {
    const port = registry.getAvailablePort();
    assert.ok(port !== null);
    assert.ok(port! >= 5100 && port! <= 5120);
  });

  it('returns null when all ports are taken', async () => {
    for (let p = 5100; p <= 5120; p++) {
      await registry.registerPort(`fill-${p}`, p);
    }
    const port = registry.getAvailablePort();
    assert.strictEqual(port, null);
  });

  it('respects a custom range override', () => {
    const port = registry.getAvailablePort(5115, 5115);
    assert.strictEqual(port, 5115);
  });
});

// ---------------------------------------------------------------------------
// ensureInitialized guard
// ---------------------------------------------------------------------------

describe('YardmasterServer.ensureInitialized()', () => {
  it('returns a descriptive error through MCP before initialization', async () => {
    const server = new YardmasterServer(activityLogger);
    const client = await connectClient(server);

    const response = await client.callTool({
      name: 'query_ports',
      arguments: {}
    });

    assert.strictEqual(response.isError, true);
    assert.strictEqual(
      getTextContent(response),
      'Error: Yardmaster server not initialized. Call start() before handling requests.'
    );
  });
});
