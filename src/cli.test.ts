/**
 * CLI output tests using the compiled executable and real temporary files.
 */

import './test-entrypoint.js';

import { createHash } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
const configJsonFixturePath = fileURLToPath(new URL(
  '../tui/internal/models/testdata/yardmaster-config-json.stdout',
  import.meta.url
));
const knownToken = 'qc-cli-secret-token-must-not-appear';

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

interface CliResult {
  code: number | null;
  argv: readonly string[];
  environment: NodeJS.ProcessEnv;
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
  environment: Record<string, string> = {},
  stdin?: string
): Promise<CliResult> {
  return runCommand(
    process.execPath,
    [cliPath, ...args],
    createChildEnvironment(home, environment),
    stdin
  );
}

function createChildEnvironment(
  home: string,
  environment: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    NGROK_AUTH_TOKEN: knownToken
  };
  for (const variable of NGROK_ENVIRONMENT_VARIABLES) {
    delete childEnvironment[variable];
  }
  Object.assign(childEnvironment, environment);
  return childEnvironment;
}

function runCommand(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  stdin?: string
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env: environment });
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
      resolve({
        code,
        argv: [executable, ...args],
        environment: { ...environment },
        stdout,
        stderr
      });
    });
    child.stdin.end(stdin);
  });
}

function assertCredentialAbsentFromProcessBoundary(
  result: CliResult,
  credential: string
): void {
  const surfaces = {
    argv: result.argv.join('\0'),
    environment: Object.entries(result.environment)
      .map(([key, value]) => `${key}=${value}`)
      .join('\0'),
    stdout: result.stdout,
    stderr: result.stderr
  };

  for (const [surface, content] of Object.entries(surfaces)) {
    assert.ok(
      !content.includes(credential),
      `credential appeared in child ${surface}`
    );
  }
}

function runCliWithReadOnlyConfig(
  args: string[],
  home: string
): Promise<CliResult> {
  const path = configPath(home);
  const script = [
    'config=$1',
    'node=$2',
    'cli=$3',
    'shift 3',
    'mount --bind "$config" "$config"',
    'mount -o remount,bind,ro "$config"',
    'exec "$node" "$cli" "$@"'
  ].join(' && ');

  return runCommand(
    'unshare',
    [
      '-Ur',
      '-m',
      'sh',
      '-c',
      script,
      'yardmaster-read-only-test',
      path,
      process.execPath,
      cliPath,
      ...args
    ],
    createChildEnvironment(home)
  );
}

async function unprivilegedUserNamespaceSkipReason(): Promise<string | null> {
  try {
    const result = await runCommand(
      'unshare',
      ['-Ur', '-m', 'true'],
      process.env
    );
    if (result.code === 0) {
      return null;
    }

    return `unprivileged user namespaces are unavailable: ${result.stderr.trim() || `unshare exited ${result.code}`}`;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return `unprivileged user namespaces are unavailable: ${detail}`;
  }
}

async function createTemporaryHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
  tempDirectories.push(home);
  return home;
}

function configPath(home: string): string {
  return join(home, '.yardmaster', 'config.json');
}

function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
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

  it('emits the shared machine-readable config contract without framing', async () => {
    const home = await createTemporaryHome();
    const expected = (await readFile(configJsonFixturePath, 'utf8')).trimEnd();
    const basicAuth = 'fixture-user:fixture-password';

    const { code, stdout, stderr } = await runCli(['config', '--json'], home, {
      NGROK_DOMAIN: 'fixture.ngrok.app',
      NGROK_BASIC_AUTH: basicAuth,
      NGROK_IP_ALLOW: '10.0.0.0/8,192.0.2.0/24',
      NGROK_IP_DENY: '203.0.113.0/24'
    });

    assert.strictEqual(code, 0, stderr);
    assert.strictEqual(stdout, expected);
    assert.deepStrictEqual(JSON.parse(stdout), JSON.parse(expected));
    assert.strictEqual(stderr, '');
    assert.ok(!stdout.includes(basicAuth));
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

      const result = key === 'ngrok.basic_auth'
        ? await runCli(['config', 'set', key, '--stdin'], home, {}, cliValue)
        : await runCli(['config', 'set', key, cliValue], home);
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
      ['config', 'set', 'ngrok.basic_auth', '--stdin'],
      home,
      {},
      'missing-password'
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

  it('rejects positional basic auth so credentials cannot cross argv', async () => {
    const home = await createTemporaryHome();
    const credential = 'alice:must-not-cross-argv';

    const result = await runCli(
      ['config', 'set', 'ngrok.basic_auth', credential],
      home
    );

    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /ngrok\.basic_auth.*--stdin/);
    assert.ok(!result.stdout.includes(credential));
    assert.ok(!result.stderr.includes(credential));
    await assert.rejects(readFile(configPath(home)), { code: 'ENOENT' });
  });

  it('applies a complete form atomically while preserving absent and unknown keys', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(configPath(home), JSON.stringify({
      future: { keep: true },
      ngrok: {
        domain: 'old.ngrok.app',
        basic_auth: 'old:credential',
        ip_deny: ['203.0.113.0/24'],
        future_setting: 'keep-me'
      }
    }), { mode: 0o600 });

    const credential = 'alice:correct-horse';
    const payload = JSON.stringify({
      'ngrok.domain': 'new.ngrok.app',
      'ngrok.basic_auth': credential,
      'ngrok.ip_allow': '10.0.0.0/8,192.0.2.0/24',
      'ngrok.ip_deny': null
    });
    const result = await runCli(
      ['config', 'apply', '--stdin'],
      home,
      {},
      payload
    );
    const storedConfig = JSON.parse(await readFile(configPath(home), 'utf8'));

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, [
      'ngrok.domain: set',
      'ngrok.basic_auth: set',
      'ngrok.ip_allow: set',
      'ngrok.ip_deny: unset',
      ''
    ].join('\n'));
    assert.ok(!result.stdout.includes(credential));
    assert.ok(!result.stderr.includes(credential));
    assert.deepStrictEqual(storedConfig.future, { keep: true });
    assert.deepStrictEqual(storedConfig.ngrok, {
      domain: 'new.ngrok.app',
      basic_auth: credential,
      ip_allow: ['10.0.0.0/8', '192.0.2.0/24'],
      future_setting: 'keep-me'
    });
  });

  it('leaves config byte-identical when the last apply value is invalid', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(
      configPath(home),
      '{"ngrok":{"domain":"keep.ngrok.app","basic_auth":"keep:secret"}}\n',
      { mode: 0o600 }
    );
    const original = await readFile(configPath(home));
    const payload = JSON.stringify({
      'ngrok.domain': 'must-not-persist.ngrok.app',
      'ngrok.basic_auth': 'alice:must-not-persist',
      'ngrok.ip_allow': '10.0.0.0/8',
      'ngrok.ip_deny': 'not-a-cidr'
    });

    const result = await runCli(
      ['config', 'apply', '--stdin'],
      home,
      {},
      payload
    );

    assert.notStrictEqual(result.code, 0);
    assert.match(result.stderr, /ngrok\.ip_deny/);
    assert.strictEqual(result.stdout, '');
    assert.strictEqual(sha256(await readFile(configPath(home))), sha256(original));
    assert.deepStrictEqual(await readFile(configPath(home)), original);
  });

  it('leaves keys absent from an apply payload untouched', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(configPath(home), JSON.stringify({
      ngrok: {
        domain: 'old.ngrok.app',
        basic_auth: 'keep:this-credential',
        ip_allow: ['10.0.0.0/8']
      }
    }), { mode: 0o600 });

    const result = await runCli(
      ['config', 'apply', '--stdin'],
      home,
      {},
      '{"ngrok.domain":"new.ngrok.app"}'
    );
    const storedConfig = JSON.parse(await readFile(configPath(home), 'utf8'));

    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(storedConfig.ngrok.domain, 'new.ngrok.app');
    assert.strictEqual(storedConfig.ngrok.basic_auth, 'keep:this-credential');
    assert.deepStrictEqual(storedConfig.ngrok.ip_allow, ['10.0.0.0/8']);
  });

  for (const invalidPayload of [
    { name: 'unparseable JSON', payload: '{"ngrok.domain":' },
    { name: 'a JSON array', payload: '[]' },
    { name: 'a non-string value', payload: '{"ngrok.domain":42}' },
    { name: 'an unknown key', payload: '{"ngrok.auth_token":null}' }
  ]) {
    it(`rejects ${invalidPayload.name} apply payload without writing`, async () => {
      const home = await createTemporaryHome();

      const result = await runCli(
        ['config', 'apply', '--stdin'],
        home,
        {},
        invalidPayload.payload
      );

      assert.notStrictEqual(result.code, 0);
      assert.strictEqual(result.stdout, '');
      await assert.rejects(readFile(configPath(home)), { code: 'ENOENT' });
    });
  }

  it('redacts a credential from malformed config apply process surfaces', async () => {
    const home = await createTemporaryHome();
    const credential = 'alice:supersecretpw';

    const result = await runCli(
      ['config', 'apply', '--stdin'],
      home,
      {},
      credential
    );

    assert.notStrictEqual(result.code, 0);
    assertCredentialAbsentFromProcessBoundary(result, credential);
  });

  for (const malformedConfigPath of [
    { name: 'read', args: ['config', '--json'] },
    {
      name: 'write',
      args: ['config', 'set', 'ngrok.domain', 'new.ngrok.app']
    }
  ]) {
    it(`redacts a credential from malformed stored config on ${malformedConfigPath.name}`, async () => {
      const home = await createTemporaryHome();
      const directory = join(home, '.yardmaster');
      const credential = 'alice:supersecretpw';
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        configPath(home),
        credential,
        { mode: 0o600 }
      );

      const result = await runCli(malformedConfigPath.args, home);

      assert.notStrictEqual(result.code, 0);
      assertCredentialAbsentFromProcessBoundary(result, credential);
    });
  }

  for (const malformed of [
    { name: 'empty file', content: '' },
    { name: 'partial JSON', content: '{"ngrok":' },
    { name: 'non-object JSON', content: '[]' }
  ]) {
    it(`fails config --json with empty stdout for a malformed ${malformed.name}`, async () => {
      const home = await createTemporaryHome();
      const directory = join(home, '.yardmaster');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(configPath(home), malformed.content, { mode: 0o600 });

      const result = await runCli(['config', '--json'], home);

      assert.notStrictEqual(result.code, 0);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /^Error:/m);
    });
  }

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

  it('rejects hostile key variants without changing config bytes', async () => {
    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(configPath(home), '{"ngrok":{"domain":"keep.ngrok.app"}}\n', {
      mode: 0o600
    });
    const originalConfig = await readFile(configPath(home));
    const hostileKeys = [
      'NGROK.DOMAIN',
      'ngrok.__proto__',
      'constructor.prototype.x',
      'ngrok.domain.unexpected'
    ];

    for (const key of hostileKeys) {
      const result = await runCli(['config', 'set', key, 'not-allowed'], home);

      assert.notStrictEqual(result.code, 0, key);
      assert.match(result.stderr, /Unsupported config key/, key);
      assert.deepStrictEqual(await readFile(configPath(home)), originalConfig, key);
    }
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

  for (const operation of ['set', 'unset'] as const) {
    it(`enforces directory 0700 and file 0600 for config ${operation}`, async () => {
      for (const initialState of ['missing', 'loose'] as const) {
        const home = await createTemporaryHome();
        const directory = join(home, '.yardmaster');
        if (initialState === 'loose') {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          await writeFile(configPath(home), JSON.stringify({
            ngrok: { domain: 'existing.ngrok.app' }
          }));
          await chmod(configPath(home), 0o666);
          await chmod(directory, 0o777);
        }

        const args = operation === 'set'
          ? ['config', 'set', 'ngrok.domain', 'updated.ngrok.app']
          : ['config', 'unset', 'ngrok.domain'];
        const result = await runCli(args, home);
        const [directoryMetadata, configMetadata] = await Promise.all([
          stat(directory),
          stat(configPath(home))
        ]);

        assert.strictEqual(result.code, 0, result.stderr);
        assert.strictEqual(
          directoryMetadata.mode & 0o777,
          0o700,
          `${operation} with ${initialState} directory`
        );
        assert.strictEqual(
          configMetadata.mode & 0o777,
          0o600,
          `${operation} with ${initialState} directory`
        );
        if (initialState === 'loose') {
          assert.match(result.stderr, /Warning: tightened .* permissions to 0700/);
        }
      }
    });
  }

  it('preserves config and leaves no temp file when atomic rename fails', async (test) => {
    const skipReason = await unprivilegedUserNamespaceSkipReason();
    if (skipReason !== null) {
      test.skip(skipReason);
      return;
    }

    const home = await createTemporaryHome();
    const directory = join(home, '.yardmaster');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(configPath(home), '{"ngrok":{"domain":"keep.ngrok.app"}}\n', {
      mode: 0o600
    });
    await chmod(configPath(home), 0o600);
    const originalHash = sha256(await readFile(configPath(home)));

    const result = await runCliWithReadOnlyConfig(
      ['config', 'set', 'ngrok.domain', 'must-not-persist.ngrok.app'],
      home
    );

    assert.strictEqual(result.code, 1, result.stderr);
    assert.match(result.stderr, /^Error:/m);
    assert.match(result.stderr, /\bEBUSY\b/);
    assert.match(result.stderr, /\brename\b/);
    assert.ok(
      result.stderr.includes(join(directory, '.config.json.')),
      result.stderr
    );
    assert.strictEqual(sha256(await readFile(configPath(home))), originalHash);
    const temporaryFiles = (await readdir(directory)).filter(
      (file) => file.startsWith('.config.json.') && file.endsWith('.tmp')
    );
    assert.deepStrictEqual(temporaryFiles, []);
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
      const setResult = key === 'ngrok.basic_auth'
        ? await runCli(['config', 'set', key, '--stdin'], home, {}, cliValue)
        : await runCli(['config', 'set', key, cliValue], home);
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
      ['config', 'set', 'ngrok.basic_auth', '--stdin'],
      home,
      {},
      'alice:correct-horse'
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
