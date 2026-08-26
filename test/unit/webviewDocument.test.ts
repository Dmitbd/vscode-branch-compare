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
    expect(html).toContain('id="complete-tree-error"');
    expect(html).toContain('id="retry-complete-tree"');
    expect(html).toContain('>Refresh<');
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
    expect(html).toContain('--metric-columns: minmax(0, 1fr) repeat(3, 6ch) 6ch 6ch');
    expect(html).toMatch(/\.metric-head,\s*\.tree-row\s*{[^}]*grid-template-columns: var\(--metric-columns\)/s);
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain('title="Added"');
    expect(html).toContain('title="Modified"');
    expect(html).toContain('title="Deleted"');
  });

  test('places BRANCHES before aligned BASE and COMPARE label, colon, and value columns', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const branches = html.indexOf('>BRANCHES<');
    const base = html.indexOf('>BASE<');
    const compare = html.indexOf('>COMPARE<');

    expect(branches).toBeGreaterThan(-1);
    expect(branches).toBeLessThan(base);
    expect(base).toBeLessThan(compare);
    expect(html).toContain('grid-template-columns: 8ch max-content minmax(0, 1fr)');
    expect(html).toContain('column-gap: 4px');
    expect(html).toMatch(/<span class="branch-label">BASE<\/span>\s*<span class="branch-colon" aria-hidden="true">:<\/span>/);
    expect(html).toMatch(/<span class="branch-label">COMPARE<\/span>\s*<span class="branch-colon" aria-hidden="true">:<\/span>/);
  });

  test('formats signed file metrics without clipping fixed folder columns', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain("appendMetric(row, formatLineMetric(node.additions, '+'), lineMetricClass(node.additions, 'addition'))");
    expect(html).toContain("appendMetric(row, formatLineMetric(node.deletions, '−'), lineMetricClass(node.deletions, 'deletion'))");
    expect(html).toContain("if (!value || value === '0')");
    expect(html).toContain("return value === '—' ? '—' : sign + value");
    expect(html).not.toContain('text-overflow: clip');
  });

  test('formats non-zero folder counters with status-specific signs and hides zeroes', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain("appendMetric(row, formatFolderMetric(counts.added, '+'), 'status-added', 'Added')");
    expect(html).toContain("appendMetric(row, formatFolderMetric(counts.modified, ''), 'status-modified', 'Modified')");
    expect(html).toContain("appendMetric(row, formatFolderMetric(counts.deleted, '−'), 'status-deleted', 'Deleted')");
    expect(html).toMatch(/function formatFolderMetric\(value, sign\) \{\s*if \(!value \|\| value === '0'\) \{\s*return '';\s*\}\s*return sign \+ String\(value\);\s*\}/);
  });

  test('defers one-time default expansion until the first completed non-empty tree', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain(
      'if (!hasInitialExpansion && !currentModel.loading && !currentModel.completeTreeLoading && currentModel.nodes.length > 0)',
    );
    expect(html).toContain('collectFolderPaths(currentModel.nodes, expandedPaths)');
    expect(html).toContain('hasInitialExpansion = true');
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

  test('keeps collapse-all local and toggles expansion state symmetrically', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const collapseHandler = html.match(
      /getElementById\('collapse-all'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/,
    )?.[1];
    const toggleFunction = html.match(
      /function toggleFolder\(path\) \{([\s\S]*?)\n    \}\n\n    function collectFolderPaths/,
    )?.[1];

    expect(collapseHandler).toContain('expandedPaths.clear()');
    expect(collapseHandler).toContain('renderTree()');
    expect(collapseHandler).not.toContain('vscode.postMessage');
    expect(toggleFunction).toContain('expandedPaths.delete(path)');
    expect(toggleFunction).toContain('expandedPaths.add(path)');
    expect(toggleFunction).toContain('renderTree(path)');
  });

  test('renders a tree-only error inline and retries only the complete-tree intent', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const retryHandler = html.match(
      /getElementById\('retry-complete-tree'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/,
    )?.[1];

    expect(html).toContain("completeTreeErrorMessage.textContent = currentModel.completeTreeError || ''");
    expect(html).toContain('completeTreeError.hidden = !currentModel.completeTreeError');
    expect(html).toContain('retryCompleteTree.hidden = !currentModel.canRetryCompleteTree');
    expect(retryHandler).toContain("vscode.postMessage({ type: 'toggle-unchanged' })");
    expect(retryHandler).not.toMatch(/fetch|checkout|switch/);
  });
});
