# Branch Compare Viewer

Compare any two local or remote-tracking Git branches inside VS Code and inspect every changed text file in the full built-in side-by-side diff.

## Why

Git hosting sites often show isolated diff hunks. Branch Compare Viewer keeps the complete file visible on both sides while preserving merge-request semantics.

## Read-only by design

The extension never edits files, stages changes, switches branches, merges, rebases, commits, or pushes. Both diff sides are virtual read-only Git snapshots. Fetch runs only when you explicitly request it and updates remote-tracking refs without changing HEAD, the index, or the working tree.

## Installation

Version 0.1.2 is distributed as a VSIX from this repository; Marketplace publication is not part of this release.

1. Build or download `branch-compare-viewer-0.1.2.vsix`.
2. In VS Code, open **Extensions**.
3. Choose **Views and More Actions… → Install from VSIX…**.
4. Select the VSIX and open the **Branch Compare** activity-bar view.

You can also install it from a terminal:

```bash
code --install-extension branch-compare-viewer-0.1.2.vsix
```

## Usage

1. Select a repository when the workspace contains more than one.
2. Select BASE and COMPARE from local and remote-tracking branches.
3. Optionally run **Fetch** to update the relevant remote-tracking refs.
4. Browse added, modified, deleted, and renamed files.
5. Open a full read-only VS Code diff.

The initial COMPARE is the current local branch. BASE prefers the selected remote's HEAD and then `main`, `master`, or `develop`. You can replace either selection at any time or swap them.

### Comparison view

The branch picker shows `BASE` above `COMPARE`; the upward arrow means the comparison is viewed from `COMPARE` toward `BASE`. The changed-files header summarizes the number of files and the total `+added` and `-deleted` lines. Every folder repeats recursive added, modified, and deleted file counts, while each changed file shows one status marker plus its own `+added/-deleted` line counts. Binary files use `—` because text line counts are unavailable.

By default, the tree contains changed files only. Use the eye button to show or hide neutral unchanged files; its Russian popover changes between `показать файлы без изменений` and `скрыть файлы без изменений`. The adjacent `свернуть все папки` button collapses the entire tree.

Opening a text file uses VS Code's native, read-only side-by-side diff. The editor follows the active theme and provides syntax highlighting for recognized file types on both sides, including unchanged files shown by the eye toggle.

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

## Limits

- Binary blobs containing a NUL byte are not opened as text.
- Text previews larger than 10 MiB are rejected.
- If a selected branch disappears after a Fetch or other external Git operation, select an available branch again.

## Development

Requires Node.js 20+, npm, Git, and VS Code 1.96 or newer.

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
