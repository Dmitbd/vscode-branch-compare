import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runTests } from '@vscode/test-electron';

const exec = promisify(execFile);

async function main(): Promise<void> {
  const fixture = await createFixture();
  try {
    await runTests({
      version: '1.96.0',
      extensionDevelopmentPath: path.resolve(__dirname, '..'),
      extensionTestsPath: path.resolve(__dirname, 'suite', 'index.test'),
      launchArgs: [fixture],
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'branch-compare-extension-'));
  try {
    await git(root, 'init', '--initial-branch=main');
    await git(root, 'config', 'user.name', 'Branch Compare Tests');
    await git(root, 'config', 'user.email', 'branch-compare@example.test');
    await writeFile(path.join(root, 'context with 100%.ts'), 'export const context = "base";\n');
    await git(root, 'add', '--all');
    await git(root, 'commit', '-m', 'base');
    await git(root, 'switch', '-c', 'feature/extension-host');
    await writeFile(path.join(root, 'context with 100%.ts'), 'export const context = "feature";\n');
    await git(root, 'add', '--all');
    await git(root, 'commit', '-m', 'feature');
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec('git', args, { cwd });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
