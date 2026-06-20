//! Diff computation over a git repository, via `gix`.
//!
//! Two responsibilities live here:
//!
//! 1. [`compute_diff`] — validate the repo and resolve a *stable id* for a
//!    comparison (deduped by refs, see [`store::get_or_create_diff`]). This is
//!    what comments hang off of.
//! 2. [`diff_summary`] — the file-level change list between two refs. It needs no
//!    database; it is pure git, so the GUI and CLI can render a diff without
//!    touching the store.
//!
//! Line-level hunks are computed separately and on demand (a later cut).

use rusqlite::Connection;

use crate::model::{Diff, DiffKind, DiffSummary, FileChange, FileStatus};
use crate::{store, Error, Result};

/// Validate `repo_path` and return the stable [`Diff`] id for this comparison.
///
/// The returned [`Diff`] carries the `id` users pass to `ugit comment <diff-id>`.
/// Re-running the same comparison returns the same id (and thus the same
/// comments) — see [`store::get_or_create_diff`].
pub fn compute_diff(
    conn: &Connection,
    repo_path: &str,
    left: &str,
    right: &str,
    kind: DiffKind,
) -> Result<Diff> {
    // Open up front so callers get a clear error rather than a dangling diff row.
    gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    store::get_or_create_diff(conn, repo_path, left, right, kind)
}

/// Compute the file-level summary of the diff between `left` and `right`.
///
/// Both refs are resolved with the same revspec grammar as `git` (branch, tag,
/// commit, `HEAD`, short SHA, `HEAD^`, …). `left` is the "before" side.
pub fn diff_summary(repo_path: &str, left: &str, right: &str) -> Result<DiffSummary> {
    let repo = gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    let old_tree = resolve_tree(&repo, left)?;
    let new_tree = resolve_tree(&repo, right)?;

    // A resource cache lets gix avoid re-reading the same blobs while computing
    // per-file line counts.
    let mut cache = repo
        .diff_resource_cache_for_tree_diff()
        .map_err(|e| Error::Git(e.to_string()))?;

    let mut files = Vec::new();
    let mut total_additions = 0u32;
    let mut total_deletions = 0u32;

    old_tree
        .changes()
        .map_err(|e| Error::Git(e.to_string()))?
        // Rename tracking is on by default, which is what gives us Renamed/Copied.
        .for_each_to_obtain_tree(&new_tree, |change| {
            use gix::object::tree::diff::Change;

            let (path, old_path, status) = match &change {
                Change::Addition { location, .. } => {
                    (location.to_string(), None, FileStatus::Added)
                }
                Change::Deletion { location, .. } => {
                    (location.to_string(), None, FileStatus::Deleted)
                }
                Change::Modification { location, .. } => {
                    (location.to_string(), None, FileStatus::Modified)
                }
                Change::Rewrite {
                    source_location,
                    location,
                    copy,
                    ..
                } => (
                    location.to_string(),
                    Some(source_location.to_string()),
                    if *copy {
                        FileStatus::Copied
                    } else {
                        FileStatus::Renamed
                    },
                ),
            };

            // `line_counts()` returns None when either side is binary.
            let (binary, additions, deletions) = match change
                .diff(&mut cache)
                .ok()
                .and_then(|mut platform| platform.line_counts().ok().flatten())
            {
                Some(counts) => (false, counts.insertions, counts.removals),
                None => (true, 0, 0),
            };

            total_additions += additions;
            total_deletions += deletions;
            files.push(FileChange {
                path,
                old_path,
                status,
                binary,
                additions,
                deletions,
            });

            cache.clear_resource_cache_keep_allocation();
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })
        .map_err(|e| Error::Git(e.to_string()))?;

    Ok(DiffSummary {
        files,
        total_additions,
        total_deletions,
    })
}

/// Resolve a revspec to its tree, with errors that name the offending ref.
fn resolve_tree<'repo>(repo: &'repo gix::Repository, rev: &str) -> Result<gix::Tree<'repo>> {
    repo.rev_parse_single(rev)
        .map_err(|e| Error::Git(format!("could not resolve '{rev}': {e}")))?
        .object()
        .map_err(|e| Error::Git(e.to_string()))?
        .peel_to_tree()
        .map_err(|e| Error::Git(format!("'{rev}' is not a tree-ish: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    /// Build a throwaway git repo with the `git` CLI (test fixture only — the
    /// product itself never shells out; it uses `gix`).
    fn git(dir: &std::path::Path, args: &[&str]) {
        let status = Command::new("git")
            .args(args)
            .current_dir(dir)
            .env("GIT_AUTHOR_NAME", "t")
            .env("GIT_AUTHOR_EMAIL", "t@t")
            .env("GIT_COMMITTER_NAME", "t")
            .env("GIT_COMMITTER_EMAIL", "t@t")
            .status()
            .unwrap();
        assert!(status.success(), "git {args:?} failed");
    }

    fn write(dir: &std::path::Path, name: &str, contents: &str) {
        std::fs::write(dir.join(name), contents).unwrap();
    }

    #[test]
    fn summary_reports_added_modified_deleted() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);

        write(p, "keep.txt", "a\nb\nc\n");
        write(p, "gone.txt", "remove me\n");
        git(p, &["add", "."]);
        git(p, &["commit", "-qm", "first"]);

        write(p, "keep.txt", "a\nB\nc\nd\n"); // 1 modified line, 1 added
        write(p, "new.txt", "brand new\n");
        std::fs::remove_file(p.join("gone.txt")).unwrap();
        git(p, &["add", "-A"]);
        git(p, &["commit", "-qm", "second"]);

        let summary = diff_summary(p.to_str().unwrap(), "HEAD^", "HEAD").unwrap();

        let by_path = |name: &str| {
            summary
                .files
                .iter()
                .find(|f| f.path == name)
                .unwrap_or_else(|| panic!("missing {name} in {:?}", summary.files))
                .clone()
        };

        assert_eq!(by_path("new.txt").status, FileStatus::Added);
        assert_eq!(by_path("gone.txt").status, FileStatus::Deleted);
        assert_eq!(by_path("keep.txt").status, FileStatus::Modified);
        assert!(summary.total_additions >= 2);
    }

    #[test]
    fn unresolvable_ref_errors() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        write(p, "a.txt", "x\n");
        git(p, &["add", "."]);
        git(p, &["commit", "-qm", "first"]);

        let err = diff_summary(p.to_str().unwrap(), "HEAD", "no-such-ref").unwrap_err();
        assert!(matches!(err, Error::Git(_)));
    }
}
