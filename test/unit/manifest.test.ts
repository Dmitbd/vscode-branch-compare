import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('extension manifest', () => {
  const manifest = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

  it('registers only read-only comparison commands', () => {
    const commands = manifest.contributes.commands.map((item: { command: string }) => item.command);
    expect(commands).toEqual([
      'branchCompare.selectRepository',
      'branchCompare.selectBase',
      'branchCompare.selectCompare',
      'branchCompare.fetch',
      'branchCompare.refresh',
      'branchCompare.swap',
      'branchCompare.openDiff',
    ]);
    expect(commands.join(' ')).not.toMatch(/checkout|merge|rebase|commit|push|stage|apply/i);
  });
});
