import { describe, expect, test } from 'vitest';
import { createWebviewDocument } from '../../src/view/webviewDocument';

describe('createWebviewDocument', () => {
  test('creates a CSP-restricted themed branch comparison document', () => {
    const html = createWebviewDocument({
      cspSource: 'vscode-resource:',
      nonce: 'fixed-nonce',
    });

    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-fixed-nonce'");
    expect(html).toContain('vscode-resource:');
    expect(html).toContain('BASE');
    expect(html).toContain('COMPARE');
    expect(html).toContain('CHANGED FILES');
    expect(html).toContain('показать файлы без изменений');
    expect(html).toContain('скрыть файлы без изменений');
    expect(html).toContain('свернуть все папки');
    expect(html).not.toContain('merges into');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  test('uses VS Code theme tokens, fixed metrics, and currentColor SVG icons', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('var(--vscode-foreground)');
    expect(html).toContain('var(--vscode-sideBar-background)');
    expect(html).toContain('var(--vscode-list-hoverBackground)');
    expect(html).toContain('var(--vscode-focusBorder)');
    expect(html).toContain('var(--vscode-gitDecoration-addedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-modifiedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-deletedResourceForeground)');
    expect(html).toContain('grid-template-columns: minmax(0, 1fr) repeat(3, 3ch) 5ch 5ch');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('title="Added"');
    expect(html).toContain('title="Modified"');
    expect(html).toContain('title="Deleted"');
  });

  test('renders untrusted model text through DOM textContent with accessible tree controls', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('.textContent =');
    expect(html).not.toContain('.innerHTML');
    expect(html).toContain('role="tree"');
    expect(html).toContain("setAttribute('role', 'treeitem')");
    expect(html).toContain("setAttribute('aria-expanded'");
    expect(html).toContain("event.key === 'ArrowLeft'");
    expect(html).toContain("event.key === 'ArrowRight'");
    expect(html).toContain("event.key === 'Enter'");
    expect(html).toContain('const expandedPaths = new Set()');
    expect(html).toContain('expandedPaths.clear()');
  });
});
