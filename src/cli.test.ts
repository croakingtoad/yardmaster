/**
 * CLI output tests using the compiled executable and real temporary files.
 */

import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
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

function runCli(command: 'config' | 'status', home: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, command], {
      env: {
        ...process.env,
        HOME: home,
        NGROK_AUTH_TOKEN: knownToken
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
    it(`${command} never emits the complete ngrok token`, async () => {
      const home = await mkdtemp(join(tmpdir(), 'yardmaster-cli-'));
      tempDirectories.push(home);

      const { stdout, stderr } = await runCli(command, home);

      assert.ok(!stdout.includes(knownToken));
      assert.ok(!stderr.includes(knownToken));
    });
  }
});
