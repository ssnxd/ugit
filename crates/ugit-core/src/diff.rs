//! Diff computation over a git repository.
//!
//! This is intentionally a skeleton for now: it validates the repo with `gix`
//! and persists a [`Diff`] row so the rest of the pipeline (ids, comments, the
//! CLI and GUI surfaces) is fully exercisable. The actual tree-to-tree change
//! computation and rendering land in a later step.

use rusqlite::Connection;

use crate::model::{Diff, DiffKind};
use crate::{store, Error, Result};

/// Compute a diff between two refs in `repo_path` and persist it.
///
/// Currently this opens the repository to confirm it is valid, then records the
/// diff request. The returned [`Diff`] carries the `id` users pass to
/// `ugit comment <diff-id>`.
pub fn compute_diff(
    conn: &Connection,
    repo_path: &str,
    left: &str,
    right: &str,
    kind: DiffKind,
) -> Result<Diff> {
    // Validate the repo up front so callers get a clear error rather than a
    // dangling diff row pointing at a non-repository.
    gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    store::insert_diff(conn, repo_path, left, right, kind)
}
