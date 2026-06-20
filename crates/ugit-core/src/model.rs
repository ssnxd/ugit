//! Domain types shared across the IPC boundary (GUI) and the CLI output.
//!
//! Everything is `Serialize`/`Deserialize` so the same struct is what Tauri
//! returns to the frontend as JSON and what `ugit comment --format json` prints.

use serde::{Deserialize, Serialize};

/// What two states of a repository a diff compares. ugit is diff-first: any
/// pair of nameable repo states can be compared.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffKind {
    /// `main` vs `feature` (or any two branches).
    BranchToBranch,
    /// One working tree vs another (e.g. two git worktrees).
    WorktreeToWorktree,
    /// Two commits.
    CommitToCommit,
    /// Any two refs (tags, remotes, SHAs) — the general case.
    RefToRef,
}

impl DiffKind {
    pub fn as_str(self) -> &'static str {
        match self {
            DiffKind::BranchToBranch => "branch-to-branch",
            DiffKind::WorktreeToWorktree => "worktree-to-worktree",
            DiffKind::CommitToCommit => "commit-to-commit",
            DiffKind::RefToRef => "ref-to-ref",
        }
    }

    pub fn from_kebab(s: &str) -> Option<DiffKind> {
        match s {
            "branch-to-branch" => Some(DiffKind::BranchToBranch),
            "worktree-to-worktree" => Some(DiffKind::WorktreeToWorktree),
            "commit-to-commit" => Some(DiffKind::CommitToCommit),
            "ref-to-ref" => Some(DiffKind::RefToRef),
            _ => None,
        }
    }
}

/// A persisted diff. Its `id` is what users pass to `ugit comment <diff-id>`
/// and what comments hang off of.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Diff {
    pub id: String,
    pub repo_path: String,
    pub left_ref: String,
    pub right_ref: String,
    pub kind: DiffKind,
    /// Unix epoch seconds.
    pub created_at: i64,
}

/// How a single file changed between the two sides of a diff.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
}

impl FileStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            FileStatus::Added => "added",
            FileStatus::Modified => "modified",
            FileStatus::Deleted => "deleted",
            FileStatus::Renamed => "renamed",
            FileStatus::Copied => "copied",
        }
    }
}

/// One changed file in a diff. This is the file-list level; line-level hunks are
/// computed separately and on demand (see [`crate::diff`]).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    /// The file's path on the *right* side (or its old path, for a deletion).
    pub path: String,
    /// For renames/copies, the file's path on the *left* side.
    pub old_path: Option<String>,
    pub status: FileStatus,
    /// True when either side is binary (no line-level diff is meaningful).
    pub binary: bool,
    /// Lines added (0 for binary files).
    pub additions: u32,
    /// Lines removed (0 for binary files).
    pub deletions: u32,
}

/// The file-level summary of a diff between two refs — the backbone the GUI's
/// file tree and the CLI's listing both render.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub files: Vec<FileChange>,
    pub total_additions: u32,
    pub total_deletions: u32,
}

/// The kind of a single line in a hunk.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DiffLineKind {
    /// Unchanged line shown for context around changes.
    Context,
    /// Line added on the right side.
    Addition,
    /// Line removed from the left side.
    Deletion,
}

/// A single line within a [`Hunk`], carrying its 1-based line numbers on each
/// side (the anchor a comment hangs off of).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    /// 1-based line number in the left/old file (None for additions).
    pub old_line: Option<u32>,
    /// 1-based line number in the right/new file (None for deletions).
    pub new_line: Option<u32>,
    /// Line text, without the trailing newline.
    pub content: String,
}

/// A contiguous run of changes with surrounding context — one `@@ … @@` block.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub lines: Vec<DiffLine>,
}

/// A file's full line-level diff — the per-file detail computed on demand.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileDiffDetail {
    pub path: String,
    pub old_path: Option<String>,
    pub status: FileStatus,
    /// True when either side is binary; `hunks` is then empty.
    pub binary: bool,
    pub hunks: Vec<Hunk>,
}

/// A branch reference, for the ref picker.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRef {
    /// Short name, e.g. `main` or `origin/feature`.
    pub name: String,
    /// Full ref name, e.g. `refs/heads/main`.
    pub full_name: String,
    /// The commit the branch points at (full hex).
    pub target: String,
    pub is_current: bool,
    pub is_remote: bool,
}

/// A tag reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRef {
    pub name: String,
    pub full_name: String,
    pub target: String,
}

/// A single commit, for the commit picker / log.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub summary: String,
    pub author_name: String,
    /// Author/commit time, Unix epoch seconds.
    pub time: i64,
}

/// A git worktree attached to a repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    pub is_main: bool,
    pub is_locked: bool,
    /// Checked-out branch (short name), when known.
    pub branch: Option<String>,
}

/// Top-level metadata about an opened repository.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub path: String,
    /// Display name (the working directory's folder name).
    pub name: String,
    /// Current branch short name, or `None` when detached.
    pub head: Option<String>,
    pub detached: bool,
}

/// A recently opened repository (persisted in the store).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub path: String,
    pub name: String,
    /// Unix epoch seconds of the last time it was opened.
    pub last_opened: i64,
}

/// A comment attached to a diff, optionally anchored to a file/line/side.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub diff_id: String,
    pub file_path: Option<String>,
    pub line: Option<i64>,
    /// "left" or "right" side of the diff, when line-anchored.
    pub side: Option<String>,
    pub body: String,
    /// Unix epoch seconds.
    pub created_at: i64,
}
