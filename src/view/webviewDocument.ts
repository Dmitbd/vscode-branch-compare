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
      --metric-columns: minmax(0, 1fr) repeat(3, 3ch) 5ch 5ch;
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

    .repository-button {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      text-transform: uppercase;
    }

    .branch-grid {
      display: grid;
      grid-template-columns: 7ch minmax(0, 1fr);
      align-items: center;
      column-gap: 4px;
    }

    .branch-label {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    .direction {
      grid-column: 1 / -1;
      justify-self: center;
      height: 16px;
      color: var(--vscode-descriptionForeground);
      line-height: 16px;
    }

    .summary {
      grid-column: 2;
      min-height: 16px;
      padding: 0 4px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-variant-numeric: tabular-nums;
    }

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

    .metric-head,
    .tree-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) repeat(3, 3ch) 5ch 5ch;
      align-items: center;
    }

    .metric-head {
      min-height: 18px;
      padding: 0 8px;
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      font-variant-numeric: tabular-nums;
    }

    .message {
      margin: 0 10px 6px;
      color: var(--vscode-descriptionForeground);
      white-space: pre-wrap;
    }

    .message.error { color: var(--vscode-errorForeground); }

    .tree {
      padding: 0 2px 8px;
      outline: none;
    }

    .tree-group { display: block; }

    .tree-row {
      width: 100%;
      min-height: 24px;
      padding: 0 6px 0 calc(6px + var(--tree-level) * 12px);
      border: 0;
      background: transparent;
      text-align: left;
      cursor: pointer;
    }

    .tree-row:hover { background: var(--vscode-list-hoverBackground); }
    .tree-row:focus { background: var(--vscode-list-focusBackground, var(--vscode-list-activeSelectionBackground)); }

    .node-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .folder-label::before {
      display: inline-block;
      width: 14px;
      color: var(--vscode-icon-foreground);
      content: '›';
      transform: rotate(0deg);
      transform-origin: center;
    }

    .tree-row[aria-expanded='true'] .folder-label::before { transform: rotate(90deg); }

    .metric {
      min-width: 0;
      overflow: hidden;
      text-align: right;
      text-overflow: clip;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .status-added { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .status-modified { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
    .status-deleted { color: var(--vscode-gitDecoration-deletedResourceForeground); }
    .addition { color: var(--vscode-gitDecoration-addedResourceForeground); }
    .deletion { color: var(--vscode-gitDecoration-deletedResourceForeground); }
  </style>
</head>
<body>
  <section class="selection" aria-label="Branch comparison">
    <button class="repository-button" id="select-repository" type="button" aria-label="выбрать репозиторий">REPOSITORY</button>
    <div class="branch-grid">
      <span class="branch-label">BASE&nbsp;&nbsp;:</span>
      <button class="branch-button" id="select-base" type="button" aria-label="выбрать базовую ветку"></button>
      <span class="direction" aria-hidden="true">↑</span>
      <span class="branch-label">COMPARE&nbsp;&nbsp;:</span>
      <button class="branch-button" id="select-compare" type="button" aria-label="выбрать сравниваемую ветку"></button>
      <div class="summary" id="summary" aria-live="polite"></div>
    </div>
  </section>

  <section aria-labelledby="changed-files-title">
    <header class="files-header">
      <h2 id="changed-files-title">CHANGED FILES</h2>
      <button class="icon-button" id="toggle-unchanged" type="button" title="показать файлы без изменений" aria-label="показать файлы без изменений">
        <svg class="icon eye-open" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 3c3.1 0 5.6 1.9 7 5-1.4 3.1-3.9 5-7 5s-5.6-1.9-7-5c1.4-3.1 3.9-5 7-5Zm0 1C5.6 4 3.6 5.4 2.1 8 3.6 10.6 5.6 12 8 12s4.4-1.4 5.9-4C12.4 5.4 10.4 4 8 4Zm0 1.5A2.5 2.5 0 1 1 8 10a2.5 2.5 0 0 1 0-5Zm0 1A1.5 1.5 0 1 0 8 9.5a1.5 1.5 0 0 0 0-3Z"/></svg>
        <svg class="icon eye-closed" viewBox="0 0 16 16" aria-hidden="true" hidden><path fill="currentColor" d="m2.1 1.4 12.5 12.5-.7.7-2.2-2.2A7.4 7.4 0 0 1 8 13c-3.1 0-5.6-1.9-7-5a9.8 9.8 0 0 1 2.3-3.2L1.4 2.1l.7-.7ZM4 5.5A8.7 8.7 0 0 0 2.1 8C3.6 10.6 5.6 12 8 12c1 0 2-.3 2.8-.7L9.6 10A2.5 2.5 0 0 1 6 6.4L4 4.5v1Zm7.8.8 2.1 1.7c-.4.8-.8 1.4-1.3 2l.7.7A10 10 0 0 0 15 8c-1.4-3.1-3.9-5-7-5-.7 0-1.4.1-2 .3l.9.9C7.3 4.1 7.6 4 8 4c1.4 0 2.7.5 3.8 1.3v1Z"/></svg>
      </button>
      <button class="icon-button" id="collapse-all" type="button" title="свернуть все папки" aria-label="свернуть все папки">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3 2h10v1H3V2Zm1 3h8v1H4V5Zm1 3h6v1H5V8Zm1 3h4v1H6v-1Z"/></svg>
      </button>
    </header>
    <div class="metric-head" aria-hidden="true">
      <span></span><span class="metric status-added" title="Added">A</span><span class="metric status-modified" title="Modified">M</span><span class="metric status-deleted" title="Deleted">D</span><span class="metric">+</span><span class="metric">−</span>
    </div>
    <p class="message" id="message" role="status" hidden></p>
    <p class="message error" id="error" role="alert" hidden></p>
    <div class="tree" id="tree" role="tree" aria-label="Changed files"></div>
  </section>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const expandedPaths = new Set();
    let hasInitialExpansion = false;
    let currentModel;

    const branchBase = document.getElementById('select-base');
    const branchCompare = document.getElementById('select-compare');
    const summary = document.getElementById('summary');
    const tree = document.getElementById('tree');
    const message = document.getElementById('message');
    const error = document.getElementById('error');
    const toggleUnchanged = document.getElementById('toggle-unchanged');
    const eyeOpen = toggleUnchanged.querySelector('.eye-open');
    const eyeClosed = toggleUnchanged.querySelector('.eye-closed');

    document.getElementById('select-repository').addEventListener('click', function () {
      vscode.postMessage({ type: 'select-repository' });
    });
    branchBase.addEventListener('click', function () { vscode.postMessage({ type: 'select-base' }); });
    branchCompare.addEventListener('click', function () { vscode.postMessage({ type: 'select-compare' }); });
    toggleUnchanged.addEventListener('click', function () { vscode.postMessage({ type: 'toggle-unchanged' }); });
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
      branchBase.textContent = currentModel.branches.base || '—';
      branchCompare.textContent = currentModel.branches.compare || '—';
      renderSummary();
      renderFilter();
      renderMessages();
      if (!hasInitialExpansion) {
        collectFolderPaths(currentModel.nodes, expandedPaths);
        hasInitialExpansion = true;
      }
      renderTree();
    }

    function renderSummary() {
      if (!currentModel.summary) {
        summary.textContent = '';
        return;
      }
      summary.textContent = String(currentModel.summary.files) + ' files   +' +
        String(currentModel.summary.additions) + '   −' + String(currentModel.summary.deletions);
    }

    function renderFilter() {
      const actionLabel = currentModel.showUnchanged
        ? 'скрыть файлы без изменений'
        : 'показать файлы без изменений';
      toggleUnchanged.title = actionLabel;
      toggleUnchanged.setAttribute('aria-label', actionLabel);
      toggleUnchanged.disabled = Boolean(currentModel.completeTreeLoading);
      toggleUnchanged.setAttribute('aria-busy', String(Boolean(currentModel.completeTreeLoading)));
      eyeOpen.hidden = Boolean(currentModel.showUnchanged);
      eyeClosed.hidden = !currentModel.showUnchanged;
    }

    function renderMessages() {
      error.hidden = !currentModel.error;
      error.textContent = currentModel.error || '';
      const status = currentModel.loading
        ? 'Загрузка сравнения…'
        : currentModel.completeTreeLoading
          ? 'Загрузка файлов без изменений…'
          : '';
      message.hidden = !status;
      message.textContent = status;
    }

    function renderTree(focusPath) {
      tree.replaceChildren();
      if (!currentModel) {
        return;
      }
      appendNodes(currentModel.nodes, tree, 1, '');
      if (focusPath) {
        focusTreeItem(focusPath);
      }
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
      const label = createLabel(node.label, true);
      row.append(label);
      appendStatusMetrics(row, node.counts);
      appendMetric(row, '', '');
      appendMetric(row, '', '');
      row.addEventListener('click', function () { toggleFolder(node.path); });
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          toggleFolder(node.path);
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          if (!expandedPaths.has(node.path)) {
            expandedPaths.add(node.path);
            renderTree(node.path);
          } else if (node.children.length > 0) {
            focusTreeItem(node.children[0].path);
          }
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          if (expandedPaths.has(node.path)) {
            expandedPaths.delete(node.path);
            renderTree(node.path);
          } else if (parentPath) {
            focusTreeItem(parentPath);
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
      row.append(createLabel(node.label, false));
      appendFileStatusMetrics(row, node.status);
      appendMetric(row, node.additions || '', 'addition');
      appendMetric(row, node.deletions || '', 'deletion');
      const open = function () {
        vscode.postMessage({ type: 'open-diff', nodeId: node.id, generation: node.generation });
      };
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          open();
        } else if (event.key === 'ArrowLeft' && parentPath) {
          event.preventDefault();
          focusTreeItem(parentPath);
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
      return row;
    }

    function createLabel(value, folder) {
      const label = document.createElement('span');
      label.className = folder ? 'node-label folder-label' : 'node-label';
      label.textContent = value;
      return label;
    }

    function appendStatusMetrics(row, counts) {
      appendMetric(row, String(counts.added), 'status-added', 'Added');
      appendMetric(row, String(counts.modified), 'status-modified', 'Modified');
      appendMetric(row, String(counts.deleted), 'status-deleted', 'Deleted');
    }

    function appendFileStatusMetrics(row, status) {
      appendMetric(row, status === 'added' ? '●' : '', 'status-added', status === 'added' ? 'Added' : '');
      appendMetric(row, status === 'modified' ? '●' : '', 'status-modified', status === 'modified' ? 'Modified' : '');
      appendMetric(row, status === 'deleted' ? '●' : '', 'status-deleted', status === 'deleted' ? 'Deleted' : '');
    }

    function appendMetric(row, value, className, title) {
      const metric = document.createElement('span');
      metric.className = 'metric' + (className ? ' ' + className : '');
      metric.textContent = value;
      if (title) {
        metric.title = title;
      }
      row.append(metric);
    }

    function toggleFolder(path) {
      if (expandedPaths.has(path)) {
        expandedPaths.delete(path);
      } else {
        expandedPaths.add(path);
      }
      renderTree(path);
    }

    function collectFolderPaths(nodes, target) {
      nodes.forEach(function (node) {
        if (node.kind === 'folder') {
          target.add(node.path);
          collectFolderPaths(node.children, target);
        }
      });
    }

    function focusTreeItem(path) {
      const items = tree.querySelectorAll('[role="treeitem"]');
      for (const item of items) {
        if (item.dataset.path === path) {
          item.focus();
          return;
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
