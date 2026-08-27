# Branch Compare Viewer

Compare any two local or remote-tracking Git branches inside VS Code or Cursor and inspect every changed text file in the full native side-by-side diff.

## Why

Git hosting sites often show isolated diff hunks. Branch Compare Viewer keeps the complete file visible on both sides while preserving merge-request semantics.

## Features

- Select independent `BASE` and `COMPARE` branches without switching the working branch.
- Browse a complete project tree containing changed files only, or temporarily include unchanged files.
- See recursive added, modified, and deleted file counts for folders.
- See added and deleted line counts for individual files, with zero values omitted.
- Hide tree metrics or collapse every expanded folder from the **CHANGED FILES** header.
- Open complete, syntax-highlighted files in the editor's native read-only diff.
- Use the active VS Code or Cursor theme, colors, fonts, and language highlighting.
- Refresh local refs, explicitly Fetch remote-tracking refs, or Swap the comparison direction.

## Read-only by design

The extension never edits files, stages changes, switches branches, merges, rebases, commits, or pushes. Both diff sides are virtual read-only Git snapshots. Fetch runs only when you explicitly request it and updates remote-tracking refs without changing HEAD, the index, or the working tree.

## Installation

Version 0.1.3 is distributed as a VSIX through GitHub Releases; Marketplace publication is not part of this release. It requires VS Code 1.96 or newer (or a compatible Cursor version) and Git 2.45 or newer.

1. Download [`branch-compare-viewer-0.1.3.vsix`](https://github.com/Dmitbd/vscode-branch-compare/releases/download/v0.1.3/branch-compare-viewer-0.1.3.vsix).
2. In VS Code or Cursor, open **Extensions**.
3. Choose **Views and More Actions… → Install from VSIX…**.
4. Select the VSIX and open the **Branch Compare** activity-bar view.

You can also install the downloaded file from a terminal:

```bash
code --install-extension branch-compare-viewer-0.1.3.vsix
# or
cursor --install-extension branch-compare-viewer-0.1.3.vsix
```

## Usage

1. Select a repository when the workspace contains more than one.
2. Select BASE and COMPARE from local and remote-tracking branches.
3. Optionally run **Fetch** to update the relevant remote-tracking refs.
4. Browse the changed-file tree and inspect its folder or file metrics.
5. Open a changed text file in the full native read-only diff.

The initial COMPARE is the current local branch. BASE prefers the selected remote's HEAD and then `main`, `master`, or `develop`. You can replace either selection at any time or swap them.

### Comparison view

The **BRANCHES** section shows `BASE` above `COMPARE`; the upward arrow indicates that `COMPARE` is being viewed toward `BASE`. The summary below the selectors shows the number of changed files and the total `+added` and `−deleted` lines.

The **CHANGED FILES** section uses the active editor theme. Added items are green, modified items use the theme's modified color, and deleted items are red. Every changed folder shows recursive added, modified, and deleted file counts. Every changed file shows a pencil and its own added and deleted line counts. Zero values are omitted, and binary files use `—` because text line counts are unavailable. Folder metrics are offset from file metrics so the two levels remain visually distinct in large trees.

By default, the tree contains changed files only. Use the eye button to show or hide neutral unchanged files; its Russian tooltip changes between `показать файлы без изменений` and `скрыть файлы без изменений`. The adjacent `±` button hides or restores only the right-side tree metrics, and the overlapping-panels button (`свернуть все папки`) collapses the entire tree.

Opening a text file uses VS Code's native, read-only side-by-side diff. The editor follows the active theme and provides syntax highlighting for recognized file types on both sides, including unchanged files shown by the eye toggle.

### Header actions

| Action | What it does |
| --- | --- |
| **fetch — обновить данные с сервера** | Explicitly updates the selected remote-tracking refs and recomputes the comparison. |
| **refresh — обновить локальные данные** | Rereads local refs and recomputes the comparison without contacting a remote. |
| **swap — поменять направление сравнения** | Exchanges `BASE` and `COMPARE`. |
| Eye button | Shows or hides unchanged project files. |
| `±` button | Hides or restores only the right-side metrics. |
| Collapse-all button | Collapses every expanded folder. |

## Comparison semantics

The extension follows merge-request semantics:

```text
merge-base(BASE, COMPARE) → COMPARE
```

The file list and left side of each diff start at the best common ancestor, not necessarily at the current tip of BASE. The right side is the selected COMPARE commit. The built-in VS Code diff shows each complete text file rather than isolated hunks.

Local branches are displayed as names such as `feature/login`. Remote-tracking branches are displayed as names such as `origin/main`. A remote-tracking branch is the local record of a remote branch; it changes only after Git fetches it.

## Fetch and Refresh

- **Refresh** rereads the repository's current refs and recomputes the comparison. It never contacts a remote.
- **Fetch** explicitly runs a Git fetch for the remote or remotes used by the selection, then rereads refs and recomputes. When both selections are local, it uses `origin` when available, otherwise the first configured remote.

If Fetch fails, the last successful comparison remains visible.

## Multiple repositories

For a workspace with one Git repository, it is selected automatically. For a multi-root workspace or a folder containing multiple repositories, the view shows a repository selector. BASE and COMPARE choices are remembered separately for each repository.

## Read-only guarantee

Branch Compare Viewer provides comparison and visual inspection only. It has no commands to edit, apply, stage, switch, merge, rebase, commit, or push. Select, Refresh, Compare, and Open Diff do not change HEAD, branch refs, the index, or working files. Fetch may update only remote-tracking refs.

Both diff documents use the extension's virtual `branch-compare` scheme and have no save provider.

Machine-readable comparison disables external diff and text-conversion helpers and reads committed `.gitattributes` from the merge-base snapshot, so dirty working-tree attributes do not affect the result. Git's normal repository-local `.git/info/attributes` and user or system attribute sources remain in effect.

## Limits

- Binary blobs containing a NUL byte are not opened as text.
- Submodule entries remain visible in the tree, but their commit pointers are not opened as text diffs.
- Text previews larger than 10 MiB are rejected.
- If a selected branch disappears after a Fetch or other external Git operation, select an available branch again.

## Development

Requires Node.js 20+, npm, Git 2.45 or newer, and VS Code 1.96 or newer.

### Cursor development sandbox

Open this repository in Cursor and press `F5`, then choose **Run Branch Compare in Cursor**. Cursor recreates a disposable Git repository under `.vscode-test/sandbox-repository`, starts the esbuild watcher, and opens a separate Extension Development Host window that loads the extension directly from this checkout. The normally installed VSIX is not replaced.

The sandbox starts on `feature/demo` and also contains `main`, so Branch Compare has a ready-made added and modified file to inspect. Use **Developer: Reload Window** in the development window after manifest changes. You can open another Git repository there when needed.

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:extension
npm run package
```

The packaged VSIX is written to the repository root. Extension-host tests download a compatible VS Code test runtime into `.vscode-test/` on first use.
