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
    expect(html).not.toContain("'unsafe-inline'");
    expect(html).not.toContain("'unsafe-eval'");
    expect(html).not.toContain('row.style.setProperty');
    expect(html).toContain("row.className = 'tree-row tree-level-'");
    expect(html).toContain('.tree-level-20 { padding-left: 246px; }');
    expect(html).toContain('BASE');
    expect(html).toContain('COMPARE');
    expect(html).toContain('CHANGED FILES');
    expect(html).toContain('показать файлы без изменений');
    expect(html).toContain('скрыть файлы без изменений');
    expect(html).toContain('свернуть все папки');
    expect(html).toContain('id="complete-tree-error"');
    expect(html).toContain('id="retry-complete-tree"');
    expect(html).toContain('id="retry-comparison"');
    expect(html).toContain('>Refresh<');
    expect(html).not.toContain('merges into');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  test('emits syntactically valid isolated webview JavaScript', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const script = html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)?.[1];

    expect(script).toBeDefined();
    expect(() => new Function(script ?? '')).not.toThrow();
  });

  test('uses VS Code theme tokens, fixed right metrics, and currentColor SVG icons', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('var(--vscode-foreground)');
    expect(html).toContain('var(--vscode-sideBar-background)');
    expect(html).toContain('var(--vscode-list-hoverBackground)');
    expect(html).toContain('var(--vscode-focusBorder)');
    expect(html).toContain('var(--vscode-gitDecoration-addedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-modifiedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-deletedResourceForeground)');
    expect(html).toContain('--metric-columns: minmax(0, 1fr) 16px repeat(3, 6ch)');
    expect(html).toMatch(/\.tree-row\s*{[^}]*grid-template-columns: var\(--metric-columns\)/s);
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("return 'Added'");
    expect(html).toContain("return 'Modified'");
    expect(html).toContain("return 'Deleted'");
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

  test('renders a no-wrap summary with a file icon and separately colored metrics', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toMatch(/\.summary\s*{[^}]*white-space: nowrap/s);
    expect(html).toContain("summary.append(createIcon('file', 'summary-icon'))");
    expect(html).toContain("appendSummaryMetric(currentModel.summaryMetrics.files, 'summary-file-count'");
    expect(html).toContain("appendSummaryMetric('+' + currentModel.summaryMetrics.additions, 'addition'");
    expect(html).toContain("appendSummaryMetric('−' + currentModel.summaryMetrics.deletions, 'deletion'");
  });

  test('renders folder file-count icon and compact status metrics without folder circles', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain("appendFileCountIcon(row)");
    expect(html).toContain("appendFolderMetrics(row, node.counts, node.formattedCounts)");
    expect(html).toContain("signedMetric(formatted.added, '+')");
    expect(html).toContain("signedMetric(formatted.modified, '')");
    expect(html).toContain("signedMetric(formatted.deleted, '−')");
    expect(html).not.toContain("status === 'added' ? '●'");
  });

  test('expands only model-approved top-level paths and lazily mounts descendants', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('currentModel.initialExpandedPaths.forEach(function (path)');
    expect(html).toContain('hasInitialExpansion = true');
    expect(html).not.toContain('collectFolderPaths');
    expect(html).toMatch(/if \(expanded\) \{[\s\S]*appendNodes\(node\.children, group/s);
  });

  test('marks loading regions busy, subdues stale content, and disables unsafe controls', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain("document.body.classList.toggle('is-loading', busy)");
    expect(html).toContain("branchesSection.setAttribute('aria-busy', String(busy))");
    expect(html).toContain("tree.setAttribute('aria-busy', String(busy))");
    expect(html).toContain('branchBase.disabled = busy');
    expect(html).toContain('row.disabled = isBusy()');
    expect(html).toMatch(/\.is-loading \.tree\s*{[^}]*opacity/s);
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
    expect(html).toContain("event.key === 'ArrowUp'");
    expect(html).toContain("event.key === 'ArrowDown'");
    expect(html).toContain("event.key === 'Home'");
    expect(html).toContain("event.key === 'End'");
    expect(html).toContain('row.tabIndex = -1');
    expect(html).toContain('setRovingFocus');
    expect(html).toContain("toggleUnchanged.setAttribute('aria-pressed'");
    expect(html).toContain("branchBase.setAttribute('aria-label', 'BASE: '");
    expect(html).toContain("repositoryButton.setAttribute('aria-label', 'REPOSITORY: '");
    expect(html).toContain("metric.setAttribute('aria-label', ariaLabel)");
    expect(html).toContain('const expandedPaths = new Set()');
    expect(html).toContain('expandedPaths.clear()');
    expect(html).toContain('row.dataset.nodeId = node.id');
    expect(html).toContain('row.dataset.parentNodeId = parentNodeId');
    expect(html).not.toContain('row.dataset.parentPath');
  });

  test('executes generated folder and file accessible-label formatters without C1 byte collisions', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const script = html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const folderFormatter = script.match(/function folderAriaLabel\(node, expanded\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    const fileFormatter = script.match(/function fileAriaLabel\(node\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    const statusFormatter = script.match(/function statusName\(status\) \{[\s\S]*?\n    \}/)?.[0] ?? '';
    const formatters = new Function(
      `${folderFormatter}\n${fileFormatter}\n${statusFormatter}\nreturn { folderAriaLabel, fileAriaLabel, statusName };`,
    )() as {
      folderAriaLabel(node: unknown, expanded: boolean): string;
      fileAriaLabel(node: unknown): string;
      statusName(status: string): string;
    };
    const counts = { added: 1, modified: 0, deleted: 0 };
    const validFolder = formatters.folderAriaLabel({ label: '\\u{85}', counts }, false);
    const invalidFolder = formatters.folderAriaLabel({ label: '\\x85', counts }, false);
    const validFile = '\\u{85}, ' + formatters.statusName('modified') + ', '
      + formatters.fileAriaLabel({ additions: '1', deletions: '0' });
    const invalidFile = '\\x85, ' + formatters.statusName('modified') + ', '
      + formatters.fileAriaLabel({ additions: '1', deletions: '0' });

    expect(validFolder).toContain('\\u{85}, folder');
    expect(invalidFolder).toContain('\\x85, folder');
    expect(validFolder).not.toBe(invalidFolder);
    expect(validFile).toContain('\\u{85}, Modified');
    expect(invalidFile).toContain('\\x85, Modified');
    expect(validFile).not.toBe(invalidFile);
  });

  test('places a status marker and file icon on the left and line metrics on the right', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const fileRenderer = html.match(
      /function appendFile\(node, parent, level, parentNodeId\) \{([\s\S]*?)\n    \}\n\n    function createRow/,
    )?.[1] ?? '';

    expect(fileRenderer).toContain('createFileLabel(node)');
    expect(fileRenderer).toContain("appendMetric(row, '', '', '', '')");
    expect(fileRenderer).toContain("formatLineMetric(node.additions, '+')");
    expect(fileRenderer).toContain("formatLineMetric(node.deletions, '−')");
    expect(html).toContain('createStatusMarker(node.status)');
    expect(html).toContain("createIcon('file', 'tree-icon')");
    expect(html).toContain("marker.title = statusName(status)");
    expect(html).toContain("metric.title = title");
    expect(html).toContain("node.binary ? 'Line changes unavailable' : fileAriaLabel(node)");
  });

  test('keeps collapse-all local and toggles expansion state symmetrically', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const collapseHandler = html.match(
      /getElementById\('collapse-all'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/,
    )?.[1];
    const toggleFunction = html.match(
      /function toggleFolder\(path, nodeId\) \{([\s\S]*?)\n    \}\n\n    function visibleRows/,
    )?.[1];

    expect(collapseHandler).toContain('expandedPaths.clear()');
    expect(collapseHandler).toContain('renderTree()');
    expect(collapseHandler).not.toContain('vscode.postMessage');
    expect(toggleFunction).toContain('expandedPaths.delete(path)');
    expect(toggleFunction).toContain('expandedPaths.add(path)');
    expect(toggleFunction).toContain('renderTree(nodeId)');
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

  test('renders a main comparison error with a strictly local Refresh action', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const retryHandler = html.match(
      /getElementById\('retry-comparison'\)\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/,
    )?.[1];

    expect(html).toContain('retryComparison.hidden = !currentModel.canRetry');
    expect(retryHandler).toContain("vscode.postMessage({ type: 'refresh' })");
    expect(retryHandler).not.toMatch(/fetch|checkout|switch/);
  });

  test('shows the active repository only for a multi-repository workspace', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('repositoryButton.textContent = repositoryLabel');
    expect(html).toContain('repositoryButton.hidden = !currentModel.showRepositorySelector');
  });
});
