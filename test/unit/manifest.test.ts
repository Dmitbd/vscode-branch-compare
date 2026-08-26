import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const readme = readFileSync(resolve('README.md'), 'utf8');

  it('registers only read-only comparison commands', () => {
    const commands = manifest.contributes.commands.map((item: { command: string }) => item.command);
    expect(commands).toEqual([
      'branchCompare.selectRepository',
      'branchCompare.selectBase',
      'branchCompare.selectCompare',
      'branchCompare.fetch',
      'branchCompare.refresh',
      'branchCompare.swap',
    ]);
    expect(commands.join(' ')).not.toMatch(/checkout|merge|rebase|commit|push|stage|apply/i);
  });

  it('uses concise Russian explanations for toolbar actions', () => {
    const commandTitles = Object.fromEntries(
      manifest.contributes.commands.map((item: { command: string; title: string }) => [item.command, item.title]),
    );

    expect(commandTitles).toMatchObject({
      'branchCompare.fetch': 'fetch — обновить данные с сервера',
      'branchCompare.refresh': 'refresh — обновить локальные данные',
      'branchCompare.swap': 'swap — поменять направление сравнения',
    });
  });

  it('contributes the comparison surface as a webview', () => {
    expect(manifest.contributes.views.branchCompare).toContainEqual({
      id: 'branchCompare.view',
      name: 'Branch Compare',
      type: 'webview',
    });
  });

  it('documents BASE above COMPARE and the upward comparison direction', () => {
    expect(readme).toContain('shows `BASE` above `COMPARE`');
    expect(readme).toContain('viewed from `COMPARE` toward `BASE`');
    expect(readme).not.toContain('shows `BASE` below `COMPARE`');
    expect(readme).not.toContain('upward arrow from BASE to COMPARE');
  });

  it('documents the minimum Git version required by the local-only read boundary', () => {
    expect(readme).toContain('Git 2.45 or newer');
  });
});
