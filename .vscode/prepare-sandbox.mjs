import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sandboxParent = resolve('.vscode-test');
const sandboxRoot = resolve(sandboxParent, 'sandbox-repository');

if (!sandboxRoot.startsWith(`${sandboxParent}/`)) {
  throw new Error(`Refusing to recreate an unexpected sandbox path: ${sandboxRoot}`);
}

rmSync(sandboxRoot, { recursive: true, force: true });
mkdirSync(resolve(sandboxRoot, 'src'), { recursive: true });

const git = (...args) => execFileSync('git', args, {
  cwd: sandboxRoot,
  stdio: 'ignore',
});

git('init', '--initial-branch=main');
git('config', 'user.name', 'Branch Compare Sandbox');
git('config', 'user.email', 'sandbox@example.invalid');

writeFileSync(resolve(sandboxRoot, 'README.md'), '# Branch Compare Sandbox\n');
writeFileSync(resolve(sandboxRoot, 'src/example.ts'), 'export const greeting = "hello";\n');
git('add', '.');
git('commit', '-m', 'chore: create sandbox base');

git('switch', '-c', 'feature/demo');
writeFileSync(resolve(sandboxRoot, 'src/example.ts'), 'export const greeting = "hello from feature";\n');
writeFileSync(resolve(sandboxRoot, 'src/new.ts'), 'export const added = true;\n');
git('add', '.');
git('commit', '-m', 'feat: add sandbox comparison');

console.log(`Sandbox repository ready at ${sandboxRoot}`);
