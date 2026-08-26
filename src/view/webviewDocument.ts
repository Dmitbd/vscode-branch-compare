export interface WebviewDocumentOptions {
  readonly cspSource: string;
  readonly nonce: string;
}

export function createWebviewDocument(options: WebviewDocumentOptions): string {
  const cspSource = escapeAttribute(options.cspSource);
  const nonce = escapeAttribute(options.nonce);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --metric-columns: minmax(0, 1fr) 16px repeat(3, 6ch);
    }

    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }

    button {
      color: inherit;
      font: inherit;
    }

    button:focus-visible {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
    }

    .selection {
      display: grid;
      gap: 4px;
      padding: 10px 10px 8px;
      border-bottom: 1px solid var(--vscode-panel-border, var(--vscode-contrastBorder));
    }

    .repository-button,
    .branch-button {
      min-width: 0;
      padding: 2px 4px;
      overflow: hidden;
      border: 0;
      background: transparent;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .repository-button:disabled,
    .branch-button:disabled { cursor: default; opacity: 0.55; }

    .repository-button {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-transform: uppercase;
    }

    .section-title {
      margin: 0;
      color: var(--vscode-foreground);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .branch-grid {
      display: grid;
      grid-template-columns: 8ch max-content minmax(0, 1fr);
      align-items: center;
      column-gap: 4px;
    }

    .branch-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .branch-colon { color: var(--vscode-descriptionForeground); }

    .direction {
      grid-column: 1 / -1;
      justify-self: center;
      height: 16px;
      color: var(--vscode-descriptionForeground);
      line-height: 16px;
    }

    .summary {
      display: flex;
      grid-column: 3;
      min-width: 0;
      min-height: 18px;
      align-items: center;
      gap: 8px;
      padding: 0 4px;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }

    .summary-icon { flex: 0 0 auto; }
    .summary-file-count { color: var(--vscode-descriptionForeground); }

    .files-header {
      display: flex;
      align-items: center;
      min-height: 34px;
      padding: 6px 6px 4px 10px;
    }

    .files-header h2 {
      min-width: 0;
      flex: 1;
      margin: 0;
      overflow: hidden;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .icon-button {
      display: inline-grid;
      width: 24px;
      height: 24px;
      place-items: center;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: transparent;
      cursor: pointer;
    }

    .icon-button:hover { background: var(--vscode-toolbar-hoverBackground, var(--vscode-list-hoverBackground)); }
    .icon-button:disabled { cursor: default; opacity: 0.55; }
    .icon { width: 16px; height: 16px; }

    .message {
      margin: 0 10px 6px;
      color: var(--vscode-descriptionForeground);
      white-space: pre-wrap;
    }

    .message.error { color: var(--vscode-errorForeground); }

    .complete-tree-error {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .complete-tree-error-message { min-width: 0; flex: 1; }

    .retry-button {
      padding: 2px 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      cursor: pointer;
    }

    .retry-button:hover { background: var(--vscode-button-hoverBackground); }
    .retry-button:disabled { cursor: default; opacity: 0.55; }

    .tree {
      padding: 0 2px 8px;
      outline: none;
    }

    .is-loading .tree { opacity: 0.55; }
    .tree-group { display: block; }

    .tree-row {
      display: grid;
      grid-template-columns: var(--metric-columns);
      width: 100%;
      min-height: 24px;
      align-items: center;
      padding: 0 6px 0 calc(6px + var(--tree-level) * 12px);
      border: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }

    .tree-row:hover { background: var(--vscode-list-hoverBackground); }
    .tree-row:focus { background: var(--vscode-list-focusBackground, var(--vscode-list-activeSelectionBackground)); }
    .tree-row:disabled { color: inherit; cursor: default; }

    .node-primary {
      display: flex;
      min-width: 0;
      align-items: center;
      gap: 4px;
      overflow: hidden;
    }

    .node-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .disclosure {
      display: inline-block;
      width: 12px;
      flex: 0 0 12px;
      color: var(--vscode-icon-foreground);
      text-align: center;
      transform: rotate(0deg);
      transform-origin: center;
    }

    .tree-row[aria-expanded='true'] .disclosure { transform: rotate(90deg); }
    .disclosure-spacer { display: inline-block; width: 12px; flex: 0 0 12px; }

    .tree-icon,
    .file-count-icon {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      color: var(--vscode-icon-foreground);
    }

    .file-count-icon { width: 14px; height: 14px; opacity: 0.8; }

    .status-marker {
      width: 7px;
      height: 7px;
      flex: 0 0 7px;
      border-radius: 50%;
      background: currentColor;
    }

    .metric {
      overflow: hidden;
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .binary-metric { grid-column: 4 / 6; text-align: right; }
    .status-added, .addition { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .status-modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
    .status-deleted, .deletion { color: var(--vscode-gitDecoration-deletedResourceForeground); }
  </style>
</head>
<body>
  <section class="selection" id="branches-section" aria-labelledby="branches-title" aria-busy="false">
    <h2 class="section-title" id="branches-title">BRANCHES</h2>
    <button class="repository-button" id="select-repository" type="button" aria-label="выбрать репозиторий"></button>
    <div class="branch-grid">
      <span class="branch-label">BASE</span>
      <span class="branch-colon" aria-hidden="true">:</span>
      <button class="branch-button" id="select-base" type="button"></button>
      <span class="direction" aria-hidden="true">↑</span>
      <span class="branch-label">COMPARE</span>
      <span class="branch-colon" aria-hidden="true">:</span>
      <button class="branch-button" id="select-compare" type="button"></button>
      <div class="summary" id="summary" aria-live="polite"></div>
    </div>
  </section>

  <section id="files-section" aria-labelledby="changed-files-title" aria-busy="false">
    <header class="files-header">
      <h2 id="changed-files-title">CHANGED FILES</h2>
      <button class="icon-button" id="toggle-unchanged" type="button" title="показать файлы без изменений" aria-label="показать файлы без изменений" aria-pressed="false">
        <svg class="icon eye-open" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 3c3.1 0 5.6 1.9 7 5-1.4 3.1-3.9 5-7 5s-5.6-1.9-7-5c1.4-3.1 3.9-5 7-5Zm0 1C5.6 4 3.6 5.4 2.1 8 3.6 10.6 5.6 12 8 12s4.4-1.4 5.9-4C12.4 5.4 10.4 4 8 4Zm0 1.5A2.5 2.5 0 1 1 8 10a2.5 2.5 0 0 1 0-5Zm0 1A1.5 1.5 0 1 0 8 9.5a1.5 1.5 0 0 0 0-3Z"/></svg>
        <svg class="icon eye-closed" viewBox="0 0 16 16" aria-hidden="true" hidden><path fill="currentColor" d="m2.1 1.4 12.5 12.5-.7.7-2.2-2.2A7.4 7.4 0 0 1 8 13c-3.1 0-5.6-1.9-7-5a9.8 9.8 0 0 1 2.3-3.2L1.4 2.1l.7-.7ZM4 5.5A8.7 8.7 0 0 0 2.1 8C3.6 10.6 5.6 12 8 12c1 0 2-.3 2.8-.7L9.6 10A2.5 2.5 0 0 1 6 6.4L4 4.5v1Zm7.8.8 2.1 1.7c-.4.8-.8 1.4-1.3 2l.7.7A10 10 0 0 0 15 8c-1.4-3.1-3.9-5-7-5-.7 0-1.4.1-2 .3l.9.9C7.3 4.1 7.6 4 8 4c1.4 0 2.7.5 3.8 1.3v1Z"/></svg>
      </button>
      <button class="icon-button" id="collapse-all" type="button" title="свернуть все папки" aria-label="свернуть все папки">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h10v1H3V2Zm1 3h8v1H4V5Zm1 3h6v1H5V8Zm1 3h4v1H6v-1Z"/></svg>
      </button>
    </header>
    <p class="message" id="message" role="status" hidden></p>
    <div class="message error complete-tree-error" id="error" role="alert" hidden>
      <span class="complete-tree-error-message" id="error-message"></span>
      <button class="retry-button" id="retry-comparison" type="button">Refresh</button>
    </div>
    <div class="message error complete-tree-error" id="complete-tree-error" role="alert" hidden>
      <span class="complete-tree-error-message" id="complete-tree-error-message"></span>
      <button class="retry-button" id="retry-complete-tree" type="button">Refresh</button>
    </div>
    <div class="tree" id="tree" role="tree" aria-label="Changed files" aria-busy="false"></div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const expandedPaths = new Set();
    let hasInitialExpansion = false;
    let currentTreeIdentity = '';
    let currentModel;
    let rovingPath = '';
    let restoreFocusPath = '';

    const branchesSection = document.getElementById('branches-section');
    const filesSection = document.getElementById('files-section');
    const branchBase = document.getElementById('select-base');
    const branchCompare = document.getElementById('select-compare');
    const repositoryButton = document.getElementById('select-repository');
    const summary = document.getElementById('summary');
    const tree = document.getElementById('tree');
    const message = document.getElementById('message');
    const error = document.getElementById('error');
    const errorMessage = document.getElementById('error-message');
    const retryComparison = document.getElementById('retry-comparison');
    const completeTreeError = document.getElementById('complete-tree-error');
    const completeTreeErrorMessage = document.getElementById('complete-tree-error-message');
    const retryCompleteTree = document.getElementById('retry-complete-tree');
    const toggleUnchanged = document.getElementById('toggle-unchanged');
    const collapseAll = document.getElementById('collapse-all');
    const eyeOpen = toggleUnchanged.querySelector('.eye-open');
    const eyeClosed = toggleUnchanged.querySelector('.eye-closed');

    repositoryButton.addEventListener('click', function () {
      vscode.postMessage({ type: 'select-repository' });
    });
    branchBase.addEventListener('click', function () { vscode.postMessage({ type: 'select-base' }); });
    branchCompare.addEventListener('click', function () { vscode.postMessage({ type: 'select-compare' }); });
    toggleUnchanged.addEventListener('click', function () { vscode.postMessage({ type: 'toggle-unchanged' }); });
    document.getElementById('retry-complete-tree').addEventListener('click', function () {
      vscode.postMessage({ type: 'toggle-unchanged' });
    });
    document.getElementById('retry-comparison').addEventListener('click', function () {
      vscode.postMessage({ type: 'refresh' });
    });
    document.getElementById('collapse-all').addEventListener('click', function () {
      expandedPaths.clear();
      renderTree();
    });

    window.addEventListener('message', function (event) {
      const data = event.data;
      if (data && data.type === 'render' && data.model) {
        currentModel = data.model;
        render();
      }
    });

    function render() {
      repositoryButton.textContent = currentModel.repositoryLabel;
      if (!repositoryButton.textContent) {
        repositoryButton.textContent = 'выбрать репозиторий';
      }
      repositoryButton.hidden = !currentModel.showRepositorySelector;

      const baseName = currentModel.branches.base || '—';
      const compareName = currentModel.branches.compare || '—';
      branchBase.textContent = baseName;
      branchCompare.textContent = compareName;
      branchBase.setAttribute('aria-label', 'BASE: ' + baseName + '. Выбрать базовую ветку');
      branchCompare.setAttribute('aria-label', 'COMPARE: ' + compareName + '. Выбрать сравниваемую ветку');
      tree.setAttribute('aria-label', 'Изменения COMPARE ' + compareName + ' в направлении BASE ' + baseName);

      const nextTreeIdentity = currentModel.repositoryLabel + '\\u0000' + baseName + '\\u0000' + compareName;
      if (currentTreeIdentity !== nextTreeIdentity) {
        currentTreeIdentity = nextTreeIdentity;
        expandedPaths.clear();
        hasInitialExpansion = false;
        rovingPath = '';
      }

      renderBusyState();
      renderSummary();
      renderFilter();
      renderMessages();
      if (!hasInitialExpansion && !currentModel.loading && !currentModel.completeTreeLoading && currentModel.nodes.length > 0) {
        currentModel.initialExpandedPaths.forEach(function (path) {
          expandedPaths.add(path);
        });
        hasInitialExpansion = true;
      }
      renderTree();
    }

    function renderBusyState() {
      const busy = isBusy();
      document.body.classList.toggle('is-loading', busy);
      branchesSection.setAttribute('aria-busy', String(busy));
      filesSection.setAttribute('aria-busy', String(busy));
      tree.setAttribute('aria-busy', String(busy));
      repositoryButton.disabled = busy;
      branchBase.disabled = busy;
      branchCompare.disabled = busy;
      toggleUnchanged.disabled = busy;
      collapseAll.disabled = busy;
      retryComparison.disabled = busy;
      retryCompleteTree.disabled = busy;
    }

    function isBusy() {
      return Boolean(currentModel && (currentModel.loading || currentModel.completeTreeLoading));
    }

    function renderSummary() {
      summary.replaceChildren();
      if (!currentModel.summaryMetrics) {
        return;
      }
      summary.append(createIcon('file', 'summary-icon'));
      appendSummaryMetric(currentModel.summaryMetrics.files, 'summary-file-count', 'Files: ' + currentModel.summaryMetrics.files);
      appendSummaryMetric('+' + currentModel.summaryMetrics.additions, 'addition', 'Added lines: ' + currentModel.summaryMetrics.additions);
      appendSummaryMetric('−' + currentModel.summaryMetrics.deletions, 'deletion', 'Deleted lines: ' + currentModel.summaryMetrics.deletions);
    }

    function appendSummaryMetric(value, className, ariaLabel) {
      const metric = document.createElement('span');
      metric.className = className;
      metric.textContent = value;
      metric.setAttribute('aria-label', ariaLabel);
      summary.append(metric);
    }

    function renderFilter() {
      const actionLabel = currentModel.showUnchanged
        ? 'скрыть файлы без изменений'
        : 'показать файлы без изменений';
      toggleUnchanged.title = actionLabel;
      toggleUnchanged.setAttribute('aria-label', actionLabel);
      toggleUnchanged.setAttribute('aria-pressed', String(Boolean(currentModel.showUnchanged)));
      eyeOpen.hidden = Boolean(currentModel.showUnchanged);
      eyeClosed.hidden = !currentModel.showUnchanged;
    }

    function renderMessages() {
      error.hidden = !currentModel.error;
      errorMessage.textContent = currentModel.error || '';
      retryComparison.hidden = !currentModel.canRetry;
      completeTreeError.hidden = !currentModel.completeTreeError;
      completeTreeErrorMessage.textContent = currentModel.completeTreeError || '';
      retryCompleteTree.hidden = !currentModel.canRetryCompleteTree;
      const status = currentModel.loading
        ? 'Загрузка сравнения…'
        : currentModel.completeTreeLoading
          ? 'Загрузка файлов без изменений…'
          : '';
      message.hidden = !status;
      message.textContent = status;
    }

    function renderTree(focusPath) {
      const active = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('[role="treeitem"]')
        : null;
      restoreFocusPath = focusPath || (active && active.dataset.path) || rovingPath;
      const shouldRestoreFocus = Boolean(focusPath || active);
      tree.replaceChildren();
      if (!currentModel) {
        return;
      }
      appendNodes(currentModel.nodes, tree, 1, '');
      ensureRovingFocus(restoreFocusPath, shouldRestoreFocus);
    }

    function appendNodes(nodes, parent, level, parentPath) {
      nodes.forEach(function (node) {
        if (node.kind === 'folder') {
          appendFolder(node, parent, level, parentPath);
        } else {
          appendFile(node, parent, level, parentPath);
        }
      });
    }

    function appendFolder(node, parent, level, parentPath) {
      const expanded = expandedPaths.has(node.path);
      const row = createRow(node, level, parentPath);
      row.setAttribute('aria-expanded', String(expanded));
      row.setAttribute('aria-label', folderAriaLabel(node, expanded));
      row.append(createFolderLabel(node));
      appendFileCountIcon(row);
      appendFolderMetrics(row, node.counts, node.formattedCounts);
      row.addEventListener('click', function () { toggleFolder(node.path); });
      row.addEventListener('keydown', function (event) {
        if (handleLinearNavigation(event, row)) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          toggleFolder(node.path);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          if (!expandedPaths.has(node.path)) {
            expandedPaths.add(node.path);
            renderTree(node.path);
          } else {
            focusFirstChild(node.path);
          }
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          if (expandedPaths.has(node.path)) {
            expandedPaths.delete(node.path);
            renderTree(node.path);
          } else if (parentPath) {
            setRovingFocus(parentPath, true);
          }
        }
      });
      parent.append(row);

      if (expanded) {
        const group = document.createElement('div');
        group.className = 'tree-group';
        group.setAttribute('role', 'group');
        appendNodes(node.children, group, level + 1, node.path);
        parent.append(group);
      }
    }

    function appendFile(node, parent, level, parentPath) {
      const row = createRow(node, level, parentPath);
      row.append(createFileLabel(node));
      appendMetric(row, '', '', '', '');
      if (node.binary) {
        appendMetric(row, '—', 'binary-metric', '', 'Line changes unavailable');
      } else {
        appendMetric(row, '', '', '', '');
        appendMetric(row, formatLineMetric(node.additions, '+'), lineMetricClass(node.additions, 'addition'), 'Added', lineAriaLabel(node.additions, 'added'));
        appendMetric(row, formatLineMetric(node.deletions, '−'), lineMetricClass(node.deletions, 'deletion'), 'Deleted', lineAriaLabel(node.deletions, 'deleted'));
      }
      const details = node.binary ? 'Line changes unavailable' : fileAriaLabel(node);
      row.setAttribute('aria-label', node.label + ', ' + statusName(node.status) + ', ' + details);
      const open = function () {
        vscode.postMessage({ type: 'open-diff', nodeId: node.id, generation: node.generation });
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (event) {
        if (handleLinearNavigation(event, row)) {
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          open();
        } else if (event.key === 'ArrowLeft' && parentPath) {
          event.preventDefault();
          setRovingFocus(parentPath, true);
        }
      });
      parent.append(row);
    }

    function createRow(node, level, parentPath) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'tree-row';
      row.style.setProperty('--tree-level', String(level - 1));
      row.dataset.path = node.path;
      row.dataset.parentPath = parentPath;
      row.setAttribute('role', 'treeitem');
      row.setAttribute('aria-level', String(level));
      row.tabIndex = -1;
      row.disabled = isBusy();
      row.addEventListener('focus', function () {
        setRovingFocus(node.path, false);
      });
      return row;
    }

    function createFolderLabel(node) {
      const primary = document.createElement('span');
      primary.className = 'node-primary';
      const disclosure = document.createElement('span');
      disclosure.className = 'disclosure';
      disclosure.setAttribute('aria-hidden', 'true');
      disclosure.textContent = '›';
      primary.append(disclosure, createIcon('folder', 'tree-icon'), createTextLabel(node.label));
      return primary;
    }

    function createFileLabel(node) {
      const primary = document.createElement('span');
      primary.className = 'node-primary';
      const spacer = document.createElement('span');
      spacer.className = 'disclosure-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      primary.append(spacer);
      if (node.status) {
        primary.append(createStatusMarker(node.status));
      }
      primary.append(createIcon('file', 'tree-icon'), createTextLabel(node.label));
      return primary;
    }

    function createTextLabel(value) {
      const label = document.createElement('span');
      label.className = 'node-label';
      label.textContent = value;
      return label;
    }

    function createStatusMarker(status) {
      const marker = document.createElement('span');
      marker.className = 'status-marker status-' + status;
      marker.title = statusName(status);
      marker.setAttribute('aria-hidden', 'true');
      return marker;
    }

    function appendFileCountIcon(row) {
      const icon = createIcon('file', 'file-count-icon');
      icon.setAttribute('aria-hidden', 'true');
      row.append(icon);
    }

    function appendFolderMetrics(row, counts, formatted) {
      appendMetric(row, signedMetric(formatted.added, '+'), 'status-added', 'Added', 'Added files: ' + counts.added);
      appendMetric(row, signedMetric(formatted.modified, ''), 'status-modified', 'Modified', 'Modified files: ' + counts.modified);
      appendMetric(row, signedMetric(formatted.deleted, '−'), 'status-deleted', 'Deleted', 'Deleted files: ' + counts.deleted);
    }

    function signedMetric(value, sign) {
      return !value || value === '0' ? '' : sign + value;
    }

    function formatLineMetric(value, sign) {
      if (!value || value === '0') {
        return '';
      }
      return value === '—' ? '—' : sign + value;
    }

    function lineMetricClass(value, className) {
      return !value || value === '0' || value === '—' ? '' : className;
    }

    function lineAriaLabel(value, kind) {
      return !value || value === '0' ? '' : kind + ' lines: ' + value;
    }

    function appendMetric(row, value, className, title, ariaLabel) {
      const metric = document.createElement('span');
      metric.className = 'metric' + (className ? ' ' + className : '');
      metric.textContent = value;
      if (title && value) {
        metric.title = title;
      }
      if (ariaLabel && value) {
        metric.setAttribute('aria-label', ariaLabel);
      } else {
        metric.setAttribute('aria-hidden', 'true');
      }
      row.append(metric);
    }

    function createIcon(kind, className) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'icon ' + className);
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', kind === 'folder'
        ? 'M1.5 3h5l1.2 1.5h6.8v8h-13V3Zm1 1v7.5h11v-6H7.2L6 4H2.5Z'
        : 'M3 1.5h6l4 4v9H3v-13Zm1 1v11h8V6H8.5V2.5H4Zm5.5.7V5H11.3L9.5 3.2Z');
      svg.append(path);
      return svg;
    }

    function folderAriaLabel(node, expanded) {
      return node.label + ', folder, ' + (expanded ? 'expanded' : 'collapsed') +
        ', added files ' + node.counts.added + ', modified files ' + node.counts.modified +
        ', deleted files ' + node.counts.deleted;
    }

    function fileAriaLabel(node) {
      return 'added lines ' + (node.additions || '0') + ', deleted lines ' + (node.deletions || '0');
    }

    function statusName(status) {
      if (status === 'added') {
        return 'Added';
      }
      if (status === 'modified') {
        return 'Modified';
      }
      if (status === 'deleted') {
        return 'Deleted';
      }
      return 'Unchanged';
    }

    function toggleFolder(path) {
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path);
      } else {
        expandedPaths.add(path);
      }
      renderTree(path);
    }

    function visibleRows() {
      return Array.from(tree.querySelectorAll('[role="treeitem"]'));
    }

    function handleLinearNavigation(event, row) {
      const rows = visibleRows();
      const index = rows.indexOf(row);
      let target;
      if (event.key === 'ArrowUp') {
        target = rows[Math.max(0, index - 1)];
      } else if (event.key === 'ArrowDown') {
        target = rows[Math.min(rows.length - 1, index + 1)];
      } else if (event.key === 'Home') {
        target = rows[0];
      } else if (event.key === 'End') {
        target = rows[rows.length - 1];
      } else {
        return false;
      }
      event.preventDefault();
      if (target) {
        setRovingFocus(target.dataset.path, true);
      }
      return true;
    }

    function focusFirstChild(parentPath) {
      const target = visibleRows().find(function (row) {
        return row.dataset.parentPath === parentPath;
      });
      if (target) {
        setRovingFocus(target.dataset.path, true);
      }
    }

    function ensureRovingFocus(preferredPath, focus) {
      const rows = visibleRows();
      if (rows.length === 0) {
        rovingPath = '';
        return;
      }
      const preferred = rows.find(function (row) { return row.dataset.path === preferredPath; });
      const target = preferred || rows[0];
      setRovingFocus(target.dataset.path, Boolean(focus));
    }

    function setRovingFocus(path, focus) {
      const rows = visibleRows();
      let target;
      rows.forEach(function (row) {
        const selected = row.dataset.path === path;
        row.tabIndex = selected ? 0 : -1;
        if (selected) {
          target = row;
        }
      });
      if (!target && rows.length > 0) {
        target = rows[0];
        target.tabIndex = 0;
      }
      if (target) {
        rovingPath = target.dataset.path;
        if (focus) {
          target.focus();
        }
      }
    }

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
