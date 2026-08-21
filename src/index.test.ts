/**
 * Tests for YardmasterServer (MCP server)
 *
 * Registry behavior is tested directly where appropriate. Server orchestration
 * behavior is exercised through a real in-memory MCP client/server transport.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { YardmasterServer } from './index.js';
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
  registry = new PortRegistry(makeConfig(tmpDir));
  await registry.initialize();
  clients = [];
});

afterEach(async () => {
  await Promise.all(clients.map(async (client) => await client.close()));
  await rm(tmpDir, { recursive: true, force: true });
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
    const server = new YardmasterServer();
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
    const server = new YardmasterServer();
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
