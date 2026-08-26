# Changelog

## 0.1.2 - 2026-08-26

- Refined the BASE-to-COMPARE header with an upward direction arrow and clearer section spacing.
- Added changed-file summaries, recursive folder status counts, and per-file added/deleted line counts, including binary-file placeholders.
- Added controls to show or hide unchanged files and collapse all folders, with dynamic Russian popovers.
- Added native theme-aware, syntax-highlighted, read-only side-by-side diffs for changed and unchanged text files.
- Kept Fetch explicit and Refresh local-only, with Swap available for reversing the selected comparison.

## 0.1.1 - 2026-08-26

- Added concise Russian hover descriptions for Fetch, Refresh, and Swap.
- Added an `F5` Cursor Extension Development Host workflow for UI testing without reinstalling the VSIX.

## 0.1.0 - 2026-08-05

- Added local and remote-tracking branch selection with per-repository persistence.
- Added merge-base comparison semantics and a native changed-file tree.
- Added full side-by-side diffs backed by read-only virtual Git snapshots.
- Added explicit Fetch, local-only Refresh, and branch Swap actions.
- Added binary and 10 MiB text-preview safeguards.
- Added unit, integration, extension-host, packaging, and CI verification.
