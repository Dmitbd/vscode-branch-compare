import assert from 'node:assert/strict';
import * as vscode from 'vscode';

interface BranchCompareTestApi {
  openFirstDiff(baseRef: string, compareRef: string): Promise<{
    readonly schemes: readonly string[];
    readonly dirty: readonly boolean[];
    readonly languageIds: readonly string[];
  }>;
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension<BranchCompareTestApi>('dmitbd.branch-compare-viewer');
  assert.ok(extension, 'The development extension must be discoverable.');
  const api = await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'branchCompare.selectRepository',
    'branchCompare.selectBase',
    'branchCompare.selectCompare',
    'branchCompare.fetch',
    'branchCompare.refresh',
    'branchCompare.swap',
  ]) {
    assert.ok(commands.includes(command), `${command} must be registered.`);
  }

  assert.equal(typeof api?.openFirstDiff, 'function', 'The extension-host test hook must be available.');
  const opened = await api.openFirstDiff('refs/heads/main', 'refs/heads/feature/extension-host');
  assert.deepEqual(opened.schemes, ['branch-compare', 'branch-compare']);
  assert.deepEqual(opened.dirty, [false, false]);
  assert.deepEqual(opened.languageIds, ['typescript', 'typescript']);
}
