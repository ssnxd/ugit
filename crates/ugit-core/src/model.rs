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
pub struct Diff {
    pub id: String,
    pub repo_path: String,
    pub left_ref: String,
    pub right_ref: String,
    pub kind: DiffKind,
    /// Unix epoch seconds.
    pub created_at: i64,
}

/// A comment attached to a diff, optionally anchored to a file/line/side.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
