import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const readJson = (path: string) => JSON.parse(readFileSync(resolve(path), 'utf8'));

describe('Cursor development sandbox', () => {
  it('launches an extension host from the workspace after starting esbuild watch', () => {
    const launch = readJson('.vscode/launch.json');
    const tasks = readJson('.vscode/tasks.json');

    expect(launch.configurations).toContainEqual(expect.objectContaining({
      name: 'Run Branch Compare in Cursor',
      type: 'extensionHost',
      request: 'launch',
      preLaunchTask: 'npm: watch',
      args: [
        '--extensionDevelopmentPath=${workspaceFolder}',
        '${workspaceFolder}',
      ],
    }));

    expect(tasks.tasks).toContainEqual(expect.objectContaining({
      label: 'npm: watch',
      type: 'npm',
      script: 'watch',
      isBackground: true,
    }));
  });

  it('signals when the initial watched build is ready', async () => {
    const watcher = spawn(process.execPath, ['esbuild.mjs', '--watch'], {
      cwd: resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = await new Promise<string>((resolveOutput, reject) => {
      let combined = '';
      const timeout = setTimeout(() => {
        watcher.kill();
        reject(new Error(`watcher did not become ready; output: ${combined}`));
      }, 2_000);

      const collect = (chunk: Buffer) => {
        combined += chunk.toString();
        if (combined.includes('[watch] build started') && combined.includes('[watch] build finished')) {
          clearTimeout(timeout);
          watcher.kill();
          resolveOutput(combined);
        }
      };

      watcher.stdout.on('data', collect);
      watcher.stderr.on('data', collect);
      watcher.on('error', reject);
    });

    expect(output).toContain('[watch] build started');
    expect(output).toContain('[watch] build finished');
  });
});
