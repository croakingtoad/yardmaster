/**
 * CLI output tests using the compiled executable and real temporary files.
 */

import './test-entrypoint.js';

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const tempDirectories: string[] = [];
const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url));
const knownToken = 'qc-cli-secret-token-must-not-appear';

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const NGROK_ENVIRONMENT_VARIABLES = [
  'NGROK_DOMAIN',
  'NGROK_BASIC_AUTH',
  'NGROK_IP_ALLOW',
  'NGROK_IP_DENY'
] as const;

function runCli(
  args: string[],
  home: string,
  environment: Record<string, string> = {}
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: home,
      NGROK_AUTH_TOKEN: knownToken
    };
    for (const variable of NGROK_ENVIRONMENT_VARIABLES) {
      delete childEnvironment[variable];
    }
    Object.assign(childEnvironment, environment);

    const child = spawn(process.execPath, [cliPath, ...args], {
      env: childEnvironment
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function createTemporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
  tempDirectories.push(home);
  return home;
}

function configPath(home: string): string {
  return join(home, '.yardmaster', 'config.json');
}

describe('CLI secret redaction', () => {
  for (const command of ['config', 'status'] as const) {
    it(`${command} renders the ngrok token as a redaction marker`, async () => {
      const home = await createTemporaryHome();

      const { code, stdout, stderr } = await runCli([command], home);

      assert.strictEqual(code, 0, stderr);
      const marker = command === 'config'
        ? '"auth_token": "(set)"'
        : 'ngrok Auth Token: (set)';
      const tokenPrefix = knownToken.substring(0, 8);

      assert.ok(stdout.includes(marker));
      assert.ok(!stdout.includes(tokenPrefix));
      assert.ok(!stderr.includes(tokenPrefix));
      assert.ok(!stdout.includes(knownToken));
      assert.ok(!stderr.includes(knownToken));
    });
  }

  it('redacts an unknown nested config field by default', async () => {
    const home = await createTemporaryHome();
    const configDirectory = join(home, '.yardmaster');
    const unknownSecret = 'unlisted-private-key-value';

    await mkdir(configDirectory, { recursive: true });
    await writeFile(join(configDirectory, 'config.json'), JSON.stringify({
      ngrok: { private_key: unknownSecret }
    }));

    const { code, stdout, stderr } = await runCli(['config'], home);

    assert.strictEqual(code, 0, stderr);
    assert.ok(stdout.includes('"private_key": "(set)"'));
    assert.ok(!stdout.includes(unknownSecret));
    assert.ok(!stderr.includes(unknownSecret));
  });
});

describe('CLI config writes', () => {
  const validSettings = [
    {
      key: 'ngrok.domain',
      cliValue: 'demo.ngrok.app',
      storedValue: 'demo.ngrok.app'
    },
    {
      key: 'ngrok.basic_auth',
      cliValue: 'alice:correct-horse',
      storedValue: 'alice:correct-horse'
    },
    {
      key: 'ngrok.ip_allow',
      cliValue: '10.0.0.0/8, 192.168.0.0/16',
      storedValue: ['10.0.0.0/8', '192.168.0.0/16']
    },
    {
      key: 'ngrok.ip_deny',
      cliValue: '203.0.113.0/24',
      storedValue: ['203.0.113.0/24']
    }
  ];

  for (const { key, cliValue, storedValue } of validSettings) {
    it(`sets ${key}`, async () => {
      const home = await createTemporaryHome();

      const result = await runCli(['config', 'set', key, cliValue], home);
      const storedConfig = JSON.parse(await readFile(configPath(home), 'utf8'));

      assert.strictEqual(result.code, 0, result.stderr);
      assert.strictEqual(result.stdout.trim(), `${key}: set`);
      assert.deepStrictEqual(storedConfig.ngrok[key.split('.')[1]], storedValue);
      if (key === 'ngrok.basic_auth') {
        assert.ok(!result.stdout.includes(cliValue));
        assert.ok(!result.stderr.includes(cliValue));
      }
    });
  }

  it('rejects invalid basic auth without writing config', async () => {
    const home = await createTemporaryHome();

    const result = await runCli(
      ['config', 'set', 'ngrok.basic_auth', 'missing-password'],
      home
    );

    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /Basic auth must be in format/);
    await assert.rejects(readFile(configPath(home)), { code: 'ENOENT' });
  });

  it('rejects any invalid CIDR without writing config', async () => {
    const home = await createTemporaryHome();

    const result = await runCli(
      ['config', 'set', 'ngrok.ip_allow', '10.0.0.0/8,not-a-cidr'],
      home
    );

    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /missing \/prefix/);
    await assert.rejects(readFile(configPath(home)), { code: 'ENOENT' });
  });

  it('rejects unknown keys without creating config', async () => {
    const home = await createTemporaryHome();

    const result = await runCli(
      ['config', 'set', 'ngrok.auth_token', 'not-allowed'],
      home
    );

    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /Unsupported config key "ngrok\.auth_token"/);
    await assert.rejects(readFile(configPath(home)), { code: 'ENOENT' });
  });

  it('preserves unknown existing config fields across a write', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true });
    await writeFile(configPath(home), JSON.stringify({
      future: { private_setting: 'keep-me' },
      ngrok: { future_ngrok_setting: { enabled: true } }
    }));

    const result = await runCli(
      ['config', 'set', 'ngrok.domain', 'demo.ngrok.app'],
      home
    );
    const storedConfig = JSON.parse(await readFile(configPath(home), 'utf8'));

    assert.strictEqual(result.code, 0, result.stderr);
    assert.deepStrictEqual(storedConfig.future, { private_setting: 'keep-me' });
    assert.deepStrictEqual(storedConfig.ngrok.future_ngrok_setting, {
      enabled: true
    });
  });

  it('tightens a loose config mode to 0600 and warns', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true });
    await writeFile(configPath(home), JSON.stringify({ ngrok: {} }));
    await chmod(configPath(home), 0o644);

    const result = await runCli(
      ['config', 'set', 'ngrok.domain', 'demo.ngrok.app'],
      home
    );
    const metadata = await stat(configPath(home));

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(metadata.mode & 0o777, 0o600);
    assert.match(result.stderr, /Warning:.*0600/);
  });

  it('unsets a key by removing it while preserving sibling keys', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true });
    await writeFile(configPath(home), JSON.stringify({
      ngrok: {
        basic_auth: 'alice:correct-horse',
        domain: 'keep.ngrok.app'
      }
    }));

    const result = await runCli(
      ['config', 'unset', 'ngrok.basic_auth'],
      home
    );
    const storedConfig = JSON.parse(await readFile(configPath(home), 'utf8'));

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout.trim(), 'ngrok.basic_auth: unset');
    assert.ok(!Object.hasOwn(storedConfig.ngrok, 'basic_auth'));
    assert.strictEqual(storedConfig.ngrok.domain, 'keep.ngrok.app');
  });

  it('keeps environment overrides above values written to config', async () => {
    const home = await createTemporaryHome();
    for (const { key, cliValue } of validSettings) {
      const setResult = await runCli(
        ['config', 'set', key, cliValue],
        home
      );
      assert.strictEqual(setResult.code, 0, setResult.stderr);
    }

    const result = await runCli(['config'], home, {
      NGROK_DOMAIN: 'environment.ngrok.app',
      NGROK_BASIC_AUTH: 'environment:secret',
      NGROK_IP_ALLOW: '172.16.0.0/12',
      NGROK_IP_DENY: '198.51.100.0/24'
    });

    assert.strictEqual(result.code, 0, result.stderr);
    assert.match(result.stdout, /"domain": "environment\.ngrok\.app"/);
    assert.match(result.stdout, /"basic_auth": "\(set\)"/);
    assert.match(result.stdout, /"ip_allow": \[\s+"172\.16\.0\.0\/12"/);
    assert.match(result.stdout, /"ip_deny": \[\s+"198\.51\.100\.0\/24"/);
    assert.ok(!result.stdout.includes('environment:secret'));
  });

  it('renders a stable set sentinel for basic auth and omits it when unset', async () => {
    const home = await createTemporaryHome();
    const setResult = await runCli(
      ['config', 'set', 'ngrok.basic_auth', 'alice:correct-horse'],
      home
    );
    assert.strictEqual(setResult.code, 0, setResult.stderr);

    const configured = await runCli(['config'], home);
    assert.strictEqual(configured.code, 0, configured.stderr);
    assert.match(configured.stdout, /"basic_auth": "\(set\)"/);
    assert.ok(!configured.stdout.includes('alice:correct-horse'));

    const unsetResult = await runCli(
      ['config', 'unset', 'ngrok.basic_auth'],
      home
    );
    assert.strictEqual(unsetResult.code, 0, unsetResult.stderr);

    const unconfigured = await runCli(['config'], home);
    assert.strictEqual(unconfigured.code, 0, unconfigured.stderr);
    assert.ok(!unconfigured.stdout.includes('"basic_auth"'));
  });
});
