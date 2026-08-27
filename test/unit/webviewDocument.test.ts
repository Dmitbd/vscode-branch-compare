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
    expect(html).toContain("row.className = 'tree-row ' + node.kind + '-row tree-level-'");
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

  test('uses model-derived shared metric grid columns without visual guides', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('var(--vscode-foreground)');
    expect(html).toContain('var(--vscode-sideBar-background)');
    expect(html).toContain('var(--vscode-list-hoverBackground)');
    expect(html).toContain('var(--vscode-focusBorder)');
    expect(html).toContain('var(--vscode-gitDecoration-addedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-modifiedResourceForeground)');
    expect(html).toContain('var(--vscode-gitDecoration-deletedResourceForeground)');
    expect(html).toContain("tree.style.setProperty('--metric-added-width', String(widths.added) + 'ch')");
    expect(html).toContain("tree.style.setProperty('--metric-modified-width', String(widths.modified) + 'ch')");
    expect(html).toContain("tree.style.setProperty('--metric-deleted-width', String(widths.deleted) + 'ch')");
    expect(html).toMatch(/function metricWidth\(value\) \{[\s\S]*Number\.isSafeInteger[\s\S]*value >= 0/s);
    expect(html).toMatch(/\.tree-row\s*{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)\s*var\(--metric-service-width\)\s*var\(--metric-added-width\)\s*var\(--metric-modified-width\)\s*var\(--metric-deleted-width\)/s);
    expect(html).toContain('--metric-service-icon-width: 14px;');
    expect(html).toMatch(/\.file-count-icon,[\s\S]*\.file-metric-icon\s*{[\s\S]*width:\s*var\(--metric-service-icon-width\)[\s\S]*height:\s*var\(--metric-service-icon-width\)[\s\S]*flex:\s*0 0 var\(--metric-service-icon-width\)/s);
    expect(html).toContain("tree.style.setProperty('--metric-service-width', hasVisibleMetrics ? 'var(--metric-service-icon-width)' : '0px')");
    expect(html).toMatch(/\.node-primary\s*{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s);
    expect(html).toMatch(/\.node-label\s*{[^}]*text-overflow:\s*ellipsis/s);
    expect(html).toContain('.metric-service { grid-column: 2; }');
    expect(html).toContain('.metric-added { grid-column: 3; }');
    expect(html).toContain('.metric-modified { grid-column: 4; }');
    expect(html).toContain('.metric-deleted { grid-column: 5; }');
    expect(html).toContain('.binary-metric { grid-column: 3 / 6; text-align: right; }');
    expect(html).not.toContain('repeat(3, 6ch)');
    expect(html).not.toMatch(/--metric-[^:;]*:[^;]*0000/i);
    expect(html).not.toContain('metric-guide');
    expect(html).not.toContain('metric-header');
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("return 'Added'");
    expect(html).toContain("return 'Modified'");
    expect(html).toContain("return 'Deleted'");
  });

  test('keeps metric columns compact and shifts folder metrics by one tree step', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain('--metric-column-gap: 2px;');
    expect(html).toContain('--folder-metric-inset: 12px;');
    expect(html).toMatch(/\.tree-row\s*{[^}]*--metric-row-inset:\s*0px[^}]*column-gap:\s*var\(--metric-column-gap\)[^}]*padding-right:\s*calc\(6px \+ var\(--metric-row-inset\)\)/s);
    expect(html).toContain('.folder-row { --metric-row-inset: var(--folder-metric-inset); }');
    expect(html).toContain("row.className = 'tree-row ' + node.kind + '-row tree-level-'");
  });

  test('renders separated branch and files sections with approved branch hierarchy', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const branches = html.indexOf('>BRANCHES<');
    const base = html.indexOf('>BASE<');
    const compare = html.indexOf('>COMPARE<');
    const arrow = html.indexOf('>↑<');

    expect(branches).toBeGreaterThan(-1);
    expect(branches).toBeLessThan(base);
    expect(base).toBeLessThan(compare);
    expect(base).toBeLessThan(arrow);
    expect(arrow).toBeLessThan(compare);
    expect(html).toContain('class="section-header branches-header"');
    expect(html).toContain('class="section-header files-header"');
    expect(html).toMatch(/\.section-header\s*{[^}]*background:/s);
    expect(html).toMatch(/\.section-header\s*{[^}]*border-bottom:/s);
    expect(html).toMatch(/\.branch-row\s*{[^}]*border:/s);
    expect(html).toMatch(/\.branch-row\s*{[^}]*background:/s);
    expect(html).toContain('grid-column: 1 / -1');
    expect(html).not.toContain('merges into');
    expect(html).toMatch(/<div class="branch-row">\s*<span class="branch-label">BASE<\/span>\s*<span class="branch-colon" aria-hidden="true">:<\/span>\s*<button class="branch-button" id="select-base"/s);
    expect(html).toMatch(/<div class="branch-row">\s*<span class="branch-label">COMPARE<\/span>\s*<span class="branch-colon" aria-hidden="true">:<\/span>\s*<button class="branch-button" id="select-compare"/s);
    expect(html).toContain('grid-template-columns: 8ch max-content minmax(0, 1fr)');
    expect(html).toMatch(/\.branch-row\s*{[^}]*column-gap:\s*(?:[5-9]px|[1-9][0-9]+px)/s);
  });

  test('renders a no-wrap summary with a file icon and separately colored metrics', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toMatch(/\.summary\s*{[^}]*white-space: nowrap/s);
    expect(html).toContain("summary.append(createIcon('file', 'summary-icon'))");
    expect(html).toContain("appendSummaryMetric(currentModel.summaryMetrics.files, 'summary-file-count'");
    expect(html).toContain("if (currentModel.summaryMetrics.additions !== '0')");
    expect(html).toContain("if (currentModel.summaryMetrics.deletions !== '0')");
    expect(html).toContain("appendSummaryMetric('+' + currentModel.summaryMetrics.additions, 'addition'");
    expect(html).toContain("appendSummaryMetric('−' + currentModel.summaryMetrics.deletions, 'deletion'");
  });

  test('renders folder file-count icon and compact status metrics without folder circles', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toContain("appendFolderMetrics(row, node.counts, node.formattedCounts)");
    expect(html).toContain("if (counts.added + counts.modified + counts.deleted > 0)");
    expect(html).toContain("createIcon('file', 'file-count-icon metric-service')");
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
    const validFolder = formatters.folderAriaLabel({ label: '\\u{85}', status: 'added', counts }, false);
    const invalidFolder = formatters.folderAriaLabel({ label: '\\x85', status: 'deleted', counts }, false);
    const validFile = formatters.fileAriaLabel({
      label: '\\u{85}', status: 'modified', additions: '1', deletions: '0', binary: false, previewable: true,
    });
    const invalidFile = formatters.fileAriaLabel({
      label: '\\x85', status: 'modified', additions: '1', deletions: '0', binary: false, previewable: true,
    });

    expect(validFolder).toContain('\\u{85}, folder, Added');
    expect(invalidFolder).toContain('\\x85, folder, Deleted');
    expect(validFolder).not.toBe(invalidFolder);
    expect(formatters.folderAriaLabel({ label: 'mixed', status: 'modified', counts }, true)).toContain('mixed, folder, Modified, expanded');
    expect(formatters.folderAriaLabel({ label: 'stable', status: undefined, counts }, false)).toContain('stable, folder, Unchanged, collapsed');
    expect(validFile).toBe('\\u{85}, Modified, added lines 1, deleted lines 0');
    expect(invalidFile).toBe('\\x85, Modified, added lines 1, deleted lines 0');
    expect(validFile).not.toBe(invalidFile);
    expect(formatters.fileAriaLabel({
      label: 'asset.bin', status: 'modified', binary: true, previewable: true,
    })).toBe('asset.bin, Modified, Line changes unavailable');
    expect(formatters.fileAriaLabel({
      label: 'vendor', status: 'modified', binary: true, previewable: false,
    })).toBe('vendor, Modified, Submodule changes cannot be previewed');
  });

  test('colors tree primary content by status and uses status-appropriate metrics without row popovers', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const fileRenderer = html.match(
      /function appendFile\(node, parent, level, parentNodeId\) \{([\s\S]*?)\n    \}\n\n    function createRow/,
    )?.[1] ?? '';
    const folderMetrics = html.match(
      /function appendFolderMetrics\(row, counts, formatted\) \{([\s\S]*?)\n    \}\n\n    function signedMetric/,
    )?.[1] ?? '';

    expect(fileRenderer).toContain('createFileLabel(node)');
    expect(html).toContain('function appendMetric(row, value, columnClass, className, ariaLabel) {\n      if (!value) {\n        return;\n      }');
    expect(fileRenderer).toContain("formatLineMetric(node.additions, '+')");
    expect(fileRenderer).toContain("formatLineMetric(node.deletions, '−')");
    expect(html).not.toContain('createStatusMarker');
    expect(html).not.toContain('.status-marker');
    expect(html).toContain("primary.className = 'node-primary' + (node.status ? ' status-' + node.status : '')");
    expect(html).toContain("createIcon('folder', 'tree-icon')");
    expect(html).toContain("createIcon('file', 'tree-icon')");
    expect(folderMetrics).toContain("if (counts.added + counts.modified + counts.deleted > 0)");
    expect(folderMetrics).toContain("createIcon('file', 'file-count-icon metric-service')");
    expect(fileRenderer).toContain("createIcon('pencil', 'file-metric-icon pencil-icon metric-service')");
    expect(html).not.toContain('row.title =');
    expect(html).not.toContain('metric.title =');
    expect(html).toContain("row.setAttribute('aria-label', folderAriaLabel(node, expanded))");
    expect(fileRenderer).toContain("row.setAttribute('aria-label', fileAriaLabel(node))");
    expect(fileRenderer).toContain("appendMetric(row, '—', 'binary-metric', '', 'Line changes unavailable')");
    expect(fileRenderer).toContain("appendMetric(row, '—', 'binary-metric', '', 'Submodule changes cannot be previewed')");
    expect(fileRenderer).toContain("row.setAttribute('aria-disabled', 'true')");
    expect(html).toContain("kind === 'pencil'");
    expect(html).toContain("kind === 'collapse-all'");
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

  test('renders the three changed-files controls with local-only metrics visibility', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const header = html.match(/<header class="section-header files-header">([\s\S]*?)<\/header>/)?.[1] ?? '';
    const metricsHandler = html.match(
      /toggleMetrics\.addEventListener\('click', function \(\) \{([\s\S]*?)\n    \}\);/,
    )?.[1];
    const collapseIcon = html.match(
      /kind === 'collapse-all'\s*\? '([^']+)'/,
    )?.[1];

    expect(header.indexOf('id="toggle-unchanged"')).toBeGreaterThan(-1);
    expect(header.indexOf('id="toggle-metrics"')).toBeGreaterThan(header.indexOf('id="toggle-unchanged"'));
    expect(header.indexOf('id="collapse-all"')).toBeGreaterThan(header.indexOf('id="toggle-metrics"'));
    expect(html).toContain('id="toggle-metrics"');
    expect(html).toContain('скрыть количество изменений');
    expect(html).toContain('показать количество изменений');
    expect(html).toContain("toggleMetrics.setAttribute('aria-pressed'");
    expect(html).toContain("tree.classList.toggle('metrics-hidden'");
    expect(html).toMatch(/\.tree\.metrics-hidden \.file-count-icon,[\s\S]*\.tree\.metrics-hidden \.pencil-icon,[\s\S]*\.tree\.metrics-hidden \.metric \{ display: none; \}/);
    expect(html).toMatch(/\.tree\.metrics-hidden \.tree-row \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(metricsHandler).not.toContain('vscode.postMessage');
    expect(metricsHandler).not.toContain('renderTree');
    expect(html).toContain("toggleUnchanged.addEventListener('click', function () { vscode.postMessage({ type: 'toggle-unchanged' }); });");
    expect(collapseIcon).toContain('M2.5 2.5h7v7h-7z');
    expect(collapseIcon).toContain('M6.5 6.5h7v7h-7z');
    expect(collapseIcon).not.toContain('M3 2h10v1H3V2');
  });

  test('executes generated metrics renderers without creating zero-value metric elements', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const script = html.match(/<script nonce="nonce">([\s\S]*?)<\/script>/)?.[1] ?? '';
    const folderMetrics = script.match(
      /function appendFolderMetrics\(row, counts, formatted\) \{[\s\S]*?\n    \}(?=\n\n    function createIcon)/,
    )?.[0] ?? '';
    const fileRenderer = script.match(
      /function appendFile\(node, parent, level, parentNodeId\) \{[\s\S]*?\n    \}(?=\n\n    function createRow)/,
    )?.[0] ?? '';
    const metricHelpers = script.match(
      /function formatLineMetric\(value, sign\) \{[\s\S]*?\n    \}(?=\n\n    function createIcon)/,
    )?.[0] ?? '';
    const folderRow = fakeElement();
    const fileRow = fakeElement();
    const document = { createElement: () => fakeElement() };
    const createIcon = (_kind: string, className: string) => {
      const icon = fakeElement();
      icon.className = 'icon ' + className;
      return icon;
    };
    const appendFolderMetrics = new Function(
      'createIcon',
      'document',
      `${folderMetrics}\nreturn appendFolderMetrics;`,
    )(createIcon, document) as (row: FakeElement, counts: Counts, formatted: FormattedCounts) => void;
    const appendFile = new Function(
      'createRow',
      'createFileLabel',
      'createIcon',
      'document',
      'vscode',
      'isBusy',
      'handleLinearNavigation',
      'setRovingFocus',
      'fileAriaLabel',
      `${fileRenderer}\n${metricHelpers}\nreturn appendFile;`,
    )(
      () => fileRow,
      () => fakeElement(),
      createIcon,
      document,
      { postMessage: () => undefined },
      () => false,
      () => false,
      () => undefined,
      () => 'file label',
    ) as (node: FileNode, parent: FakeElement, level: number, parentNodeId: string) => void;

    appendFolderMetrics(
      folderRow,
      { added: 2, modified: 0, deleted: 3 },
      { added: '2', modified: '0', deleted: '3' },
    );
    expect(metricClasses(folderRow)).toEqual([
      'icon file-count-icon metric-service',
      'metric metric-added status-added',
      'metric metric-deleted status-deleted',
    ]);

    appendFile({ status: 'added', additions: '5', deletions: '0', previewable: true }, fakeElement(), 1, '');
    expect(metricClasses(fileRow)).toEqual([
      'icon file-metric-icon pencil-icon metric-service',
      'metric metric-added addition',
    ]);

    const deletedRow = fakeElement();
    const appendDeletedFile = new Function(
      'createRow', 'createFileLabel', 'createIcon', 'document', 'vscode', 'isBusy', 'handleLinearNavigation', 'setRovingFocus', 'fileAriaLabel',
      `${fileRenderer}\n${metricHelpers}\nreturn appendFile;`,
    )(
      () => deletedRow, () => fakeElement(), createIcon, document, { postMessage: () => undefined }, () => false,
      () => false, () => undefined, () => 'file label',
    ) as (node: FileNode, parent: FakeElement, level: number, parentNodeId: string) => void;
    appendDeletedFile({ status: 'deleted', additions: '0', deletions: '4', previewable: true }, fakeElement(), 1, '');
    expect(metricClasses(deletedRow)).toEqual([
      'icon file-metric-icon pencil-icon metric-service',
      'metric metric-deleted deletion',
    ]);

    const unchangedRow = fakeElement();
    const appendUnchangedFile = new Function(
      'createRow', 'createFileLabel', 'createIcon', 'document', 'vscode', 'isBusy', 'handleLinearNavigation', 'setRovingFocus', 'fileAriaLabel',
      `${fileRenderer}\n${metricHelpers}\nreturn appendFile;`,
    )(
      () => unchangedRow, () => fakeElement(), createIcon, document, { postMessage: () => undefined }, () => false,
      () => false, () => undefined, () => 'file label',
    ) as (node: FileNode, parent: FakeElement, level: number, parentNodeId: string) => void;
    appendUnchangedFile({ previewable: true }, fakeElement(), 1, '');
    expect(metricClasses(unchangedRow)).toEqual([]);
  });

  test('caches service-metric visibility for a model and keeps the metrics toggle presentation-only', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });
    const handler = html.match(
      /if \(data && data.type === 'render' && data.model\) \{([\s\S]*?)\n      \}/,
    )?.[1] ?? '';
    const metricColumns = html.match(
      /function renderMetricColumns\(\) \{([\s\S]*?)\n    \}/,
    )?.[1] ?? '';

    expect(html).toContain('let hasVisibleMetrics = false;');
    expect(handler).toContain('hasVisibleMetrics = calculateVisibleMetrics(currentModel.nodes);');
    expect(metricColumns).toContain("hasVisibleMetrics ? 'var(--metric-service-icon-width)' : '0px'");
    expect(metricColumns).not.toContain('calculateVisibleMetrics');
    expect(html).not.toContain('function hasVisibleMetrics(nodes)');
  });

  test('limits visible tooltips to header icon buttons', () => {
    const html = createWebviewDocument({ cspSource: 'test:', nonce: 'nonce' });

    expect(html).toMatch(/<button class="icon-button" id="toggle-unchanged"[^>]*title=/);
    expect(html).toMatch(/<button class="icon-button" id="toggle-metrics"[^>]*title=/);
    expect(html).toMatch(/<button class="icon-button" id="collapse-all"[^>]*title=/);
    expect(html).not.toContain('row.title =');
    expect(html).not.toContain('metric.title =');
    expect(html).not.toContain("svg.setAttribute('title'");
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

type Counts = { added: number; modified: number; deleted: number };
type FormattedCounts = { added: string; modified: string; deleted: string };
type FileNode = {
  status?: string;
  additions?: string;
  deletions?: string;
  previewable: boolean;
  binary?: boolean;
  id?: string;
  generation?: number;
};
type FakeElement = {
  children: FakeElement[];
  className: string;
  textContent: string;
  dataset: Record<string, string>;
  append(...children: FakeElement[]): void;
  addEventListener(): void;
  setAttribute(): void;
};

function fakeElement(): FakeElement {
  return {
    children: [],
    className: '',
    textContent: '',
    dataset: {},
    append(...children) { this.children.push(...children); },
    addEventListener() {},
    setAttribute() {},
  };
}

function metricClasses(row: FakeElement): string[] {
  return row.children.map((child) => child.className).filter((className) => className.includes('metric'));
}
