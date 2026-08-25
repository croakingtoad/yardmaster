/**
 * CLI output tests using the compiled executable and real temporary files.
 */

import './test-entrypoint.js';

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const tempDirectories: string[] = [];
const cliPath = fileURLToPath(new URL('./cli.js', import.meta.url));
const knownToken = 'qc-cli-secret-token-must-not-appear';
const knownBasicAuth = 'qc-user:qc-cli-basic-auth-secret-must-not-appear';

afterEach(async () => {
  await Promise.all(tempDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

function runCli(command: 'config' | 'status', home: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, command], {
      env: {
        ...process.env,
        HOME: home,
        NGROK_AUTH_TOKEN: knownToken,
        NGROK_BASIC_AUTH: knownBasicAuth
      }
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
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`yardmaster ${command} exited ${code}: ${stderr}`));
      }
    });
  });
}

describe('CLI secret redaction', () => {
  for (const command of ['config', 'status'] as const) {
    it(`${command} renders the ngrok token as a redaction marker`, async () => {
      const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
      tempDirectories.push(home);

      const { stdout, stderr } = await runCli(command, home);

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

  it('config renders ngrok basic auth as a redaction marker', async () => {
    const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
    tempDirectories.push(home);

    const { stdout, stderr } = await runCli('config', home);
    const basicAuthPrefix = knownBasicAuth.substring(0, 8);

    assert.ok(stdout.includes('"basic_auth": "(set)"'));
    assert.ok(!stdout.includes(basicAuthPrefix));
    assert.ok(!stderr.includes(basicAuthPrefix));
    assert.ok(!stdout.includes(knownBasicAuth));
    assert.ok(!stderr.includes(knownBasicAuth));
  });

  it('redacts an unknown nested config field by default', async () => {
    const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
    tempDirectories.push(home);
    const configDirectory = join(home, '.yardmaster');
    const unknownSecret = 'unlisted-private-key-value';

    await mkdir(configDirectory, { recursive: true });
    await writeFile(join(configDirectory, 'config.json'), JSON.stringify({
      ngrok: { private_key: unknownSecret }
    }));

    const { stdout, stderr } = await runCli('config', home);

    assert.ok(stdout.includes('"private_key": "(set)"'));
    assert.ok(!stdout.includes(unknownSecret));
    assert.ok(!stderr.includes(unknownSecret));
  });

  for (const command of ['config', 'status'] as const) {
    it(`${command} redacts an object nested beneath an allowlisted leaf`, async () => {
      const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
      tempDirectories.push(home);
      const configDirectory = join(home, '.yardmaster');
      const unexpectedValue = 'nested-value-must-not-appear';

      await mkdir(configDirectory, { recursive: true });
      await writeFile(join(configDirectory, 'config.json'), JSON.stringify({
        ngrok: { region: { unanticipated: unexpectedValue } }
      }));

      const { stdout, stderr } = await runCli(command, home);

      const marker = command === 'config'
        ? '"region": "(set)"'
        : 'ngrok Region: (set)';
      assert.ok(stdout.includes(marker));
      assert.ok(!stdout.includes(unexpectedValue));
      assert.ok(!stderr.includes(unexpectedValue));
    });
  }

  for (const field of ['ip_allow', 'ip_deny'] as const) {
    it(`config redacts ${field} when an array member is not a string`, async () => {
      const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
      tempDirectories.push(home);
      const configDirectory = join(home, '.yardmaster');
      const unexpectedValue = `${field}-member-must-not-appear`;

      await mkdir(configDirectory, { recursive: true });
      await writeFile(join(configDirectory, 'config.json'), JSON.stringify({
        ngrok: {
          [field]: ['192.0.2.0/24', { unexpected: unexpectedValue }]
        }
      }));

      const { stdout, stderr } = await runCli('config', home);

      assert.ok(stdout.includes(`"${field}": "(set)"`));
      assert.ok(!stdout.includes(unexpectedValue));
      assert.ok(!stderr.includes(unexpectedValue));
    });
  }

  for (const command of ['config', 'status'] as const) {
    it(`${command} redacts a wrong-shaped numeric config leaf`, async () => {
      const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
      tempDirectories.push(home);
      const configDirectory = join(home, '.yardmaster');
      const unexpectedValue = 'numeric-value-must-not-appear';

      await mkdir(configDirectory, { recursive: true });
      await writeFile(join(configDirectory, 'config.json'), JSON.stringify({
        port_range: { start: unexpectedValue }
      }));

      const { stdout, stderr } = await runCli(command, home);

      const marker = command === 'config'
        ? '"start": "(set)"'
        : 'Port Range: (set) - 9000';
      assert.ok(stdout.includes(marker));
      assert.ok(!stdout.includes(unexpectedValue));
      assert.ok(!stderr.includes(unexpectedValue));
    });
  }
});
