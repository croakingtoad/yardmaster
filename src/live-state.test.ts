/**
 * Full-suite guard against writes to the operator's live Yardmaster state.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { it } from 'node:test';
import assert from 'node:assert/strict';

interface FileState {
  size: string;
  mtimeNs: string;
  sha256: string;
}

type YardmasterState = Record<string, FileState>;

const distDirectory = dirname(fileURLToPath(import.meta.url));
const liveDirectory = join(homedir(), '.yardmaster');
const liveActivityPath = join(liveDirectory, 'logs', 'activity.log');

async function captureFile(path: string): Promise<FileState | null> {
  try {
    const [metadata, content] = await Promise.all([
      stat(path, { bigint: true }),
      readFile(path)
    ]);
    return {
      size: metadata.size.toString(),
      mtimeNs: metadata.mtimeNs.toString(),
      sha256: createHash('sha256').update(content).digest('hex')
    };
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null;
    }
    throw error;
  }
}

async function captureTree(
  directory: string,
  state: YardmasterState = {}
): Promise<YardmasterState> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return state;
    }
    throw error;
  }

  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await captureTree(path, state);
    } else if (entry.isFile()) {
      const fileState = await captureFile(path);
      if (fileState) {
        state[relative(liveDirectory, path)] = fileState;
      }
    }
  }
  return state;
}

async function runOtherTests(): Promise<number | null> {
  const files = (await readdir(distDirectory))
    .filter(
      (file) => file.endsWith('.test.js') && file !== basename(import.meta.url)
    )
    .map((file) => join(distDirectory, file));
  const childEnvironment = { ...process.env };
  delete childEnvironment.NODE_TEST_CONTEXT;

  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--test', ...files], {
      env: childEnvironment,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', resolve);
  });
}

it('leaves the live ~/.yardmaster state byte-identical after the full suite', async () => {
  const activityBefore = await captureFile(liveActivityPath);
  const treeBefore = await captureTree(liveDirectory);

  const exitCode = await runOtherTests();

  const activityAfter = await captureFile(liveActivityPath);
  const treeAfter = await captureTree(liveDirectory);

  assert.strictEqual(exitCode, 0, 'the nested test suite must pass');
  assert.deepStrictEqual(
    activityAfter,
    activityBefore,
    'live activity.log size, mtime, or content changed during the test suite'
  );
  assert.deepStrictEqual(
    treeAfter,
    treeBefore,
    'a test wrote, removed, or changed a file under ~/.yardmaster'
  );
});
