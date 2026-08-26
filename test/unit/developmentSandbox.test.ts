import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
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
      preLaunchTask: 'npm: sandbox',
      args: [
        '${workspaceFolder}/.vscode-test/sandbox-repository',
        '--extensionDevelopmentPath=${workspaceFolder}',
      ],
    }));

    expect(tasks.tasks).toContainEqual(expect.objectContaining({
      label: 'npm: sandbox',
      type: 'npm',
      script: 'sandbox',
      isBackground: true,
    }));
  });

  it('prepares a disposable repository with divergent branches', () => {
    const manifest = readJson('package.json');
    expect(manifest.scripts['sandbox:prepare']).toBe('node .vscode/prepare-sandbox.mjs');
    expect(manifest.scripts.sandbox).toBe('npm run sandbox:prepare && npm run watch');

    execFileSync(process.execPath, ['.vscode/prepare-sandbox.mjs'], { cwd: resolve('.') });

    const sandboxRoot = resolve('.vscode-test/sandbox-repository');
    const git = (...args: string[]) => execFileSync('git', args, {
      cwd: sandboxRoot,
      encoding: 'utf8',
    }).trim();
    const longPath = 'src/components/branch-comparison/results/folders/deeply/nested/path/that/needs/ellipsis/long-file-name-for-ellipsis.ts';

    expect(git('branch', '--show-current')).toBe('feature/demo');
    expect(git('for-each-ref', '--format=%(refname:short)', 'refs/heads')).toBe('feature/demo\nmain');
    expect(git('diff', '--name-status', '--find-renames', 'main..feature/demo')).toBe([
      'M\tassets/sample.bin',
      `A\t${longPath}`,
      'M\tsrc/example.ts',
      'D\tsrc/legacy/deleted.ts',
      'R100\tsrc/legacy/renamed-from.ts\tsrc/renamed/renamed-to.ts',
    ].join('\n'));
    expect(git('diff', '--numstat', 'main..feature/demo', '--', 'src/example.ts')).toBe(
      '2\t1\tsrc/example.ts',
    );
    expect(git('diff', '--numstat', 'main..feature/demo', '--', 'assets/sample.bin')).toBe(
      '-\t-\tassets/sample.bin',
    );
    expect(git('ls-tree', '-r', '--name-only', 'main')).toContain('src/shared/nested/unchanged.ts');
    expect(git('ls-tree', '-r', '--name-only', 'main')).toContain('src/shared/nested/deeper/stable.ts');
    expect(git('diff', '--name-only', 'main..feature/demo')).not.toContain('src/shared/nested/');
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
