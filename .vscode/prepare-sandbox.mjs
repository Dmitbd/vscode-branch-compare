import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sandboxParent = resolve('.vscode-test');
const sandboxRoot = resolve(sandboxParent, 'sandbox-repository');

if (!sandboxRoot.startsWith(`${sandboxParent}/`)) {
  throw new Error(`Refusing to recreate an unexpected sandbox path: ${sandboxRoot}`);
}

rmSync(sandboxRoot, { recursive: true, force: true });
for (const directory of [
  'assets',
  'src/legacy',
  'src/shared/nested/deeper',
]) {
  mkdirSync(resolve(sandboxRoot, directory), { recursive: true });
}

const git = (...args) => execFileSync('git', args, {
  cwd: sandboxRoot,
  stdio: 'ignore',
});

git('init', '--initial-branch=main');
git('config', 'user.name', 'Branch Compare Sandbox');
git('config', 'user.email', 'sandbox@example.invalid');

writeFileSync(resolve(sandboxRoot, 'README.md'), '# Branch Compare Sandbox\n');
writeFileSync(resolve(sandboxRoot, 'assets/sample.bin'), Buffer.from([0, 1, 2, 3, 4, 5]));
writeFileSync(resolve(sandboxRoot, 'src/example.ts'), [
  'export const greeting = "hello";',
  'export const audience = "world";',
  '',
].join('\n'));
writeFileSync(resolve(sandboxRoot, 'src/legacy/deleted.ts'), 'export const legacy = true;\n');
writeFileSync(resolve(sandboxRoot, 'src/legacy/renamed-from.ts'), 'export const renamed = true;\n');
writeFileSync(resolve(sandboxRoot, 'src/shared/nested/unchanged.ts'), 'export const unchanged = true;\n');
writeFileSync(resolve(sandboxRoot, 'src/shared/nested/deeper/stable.ts'), 'export const stable = true;\n');
git('add', '.');
git('commit', '-m', 'chore: create sandbox base');

git('switch', '-c', 'feature/demo');
writeFileSync(resolve(sandboxRoot, 'assets/sample.bin'), Buffer.from([0, 6, 7, 8, 9, 10]));
writeFileSync(resolve(sandboxRoot, 'src/example.ts'), [
  'export const greeting = "hello from feature";',
  'export const audience = "world";',
  'export const version = 2;',
  '',
].join('\n'));
rmSync(resolve(sandboxRoot, 'src/legacy/deleted.ts'));
mkdirSync(resolve(sandboxRoot, 'src/renamed'), { recursive: true });
git('mv', 'src/legacy/renamed-from.ts', 'src/renamed/renamed-to.ts');
const longPath = 'src/components/branch-comparison/results/folders/deeply/nested/path/that/needs/ellipsis';
mkdirSync(resolve(sandboxRoot, longPath), { recursive: true });
writeFileSync(
  resolve(sandboxRoot, longPath, 'long-file-name-for-ellipsis.ts'),
  'export const addedAtALongPath = true;\n',
);
git('add', '.');
git('commit', '-m', 'feat: add sandbox comparison');

console.log(`Sandbox repository ready at ${sandboxRoot}`);
