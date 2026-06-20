//! Diff computation over a git repository, via `gix`.
//!
//! Responsibilities:
//!
//! 1. [`compute_diff`] — validate the repo and resolve a *stable id* for a
//!    comparison (deduped by refs, see [`store::get_or_create_diff`]).
//! 2. [`diff_summary`] — the file-level change list (fast: status + line counts).
//! 3. [`file_hunks`] / [`diff_detail`] — line-level hunks with line numbers,
//!    computed on demand. [`unified_diff`] renders the patch the CLI exports.
//! 4. [`file_content`] — a blob's text at a ref (the GUI feeds these to the diff
//!    renderer as the before/after sides).
//!
//! All line-level work runs through one `gix` blob `UnifiedDiff` pass, so the
//! structured form and the patch string can never drift.

use rusqlite::Connection;

use crate::model::{
    Diff, DiffKind, DiffLine, DiffLineKind, DiffSummary, FileChange, FileDiffDetail, FileStatus,
    Hunk,
};
use crate::{store, Error, Result};

/// Validate `repo_path` and return the stable [`Diff`] id for this comparison.
pub fn compute_diff(
    conn: &Connection,
    repo_path: &str,
    left: &str,
    right: &str,
    kind: DiffKind,
) -> Result<Diff> {
    gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    store::get_or_create_diff(conn, repo_path, left, right, kind)
}

/// Compute the file-level summary of the diff between `left` and `right`.
pub fn diff_summary(repo_path: &str, left: &str, right: &str) -> Result<DiffSummary> {
    let repo = gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    let old_tree = resolve_tree(&repo, left)?;
    let new_tree = resolve_tree(&repo, right)?;

    let mut cache = repo
        .diff_resource_cache_for_tree_diff()
        .map_err(|e| Error::Git(e.to_string()))?;

    let mut files = Vec::new();
    let mut total_additions = 0u32;
    let mut total_deletions = 0u32;

    old_tree
        .changes()
        .map_err(|e| Error::Git(e.to_string()))?
        .for_each_to_obtain_tree(&new_tree, |change| {
            if is_tree_change(&change) {
                return Ok(std::ops::ControlFlow::Continue(()));
            }
            let (path, old_path, status) = change_meta(&change);

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

/// Line-level hunks for a single file (the lazy, per-file path used by the GUI).
///
/// `old_path` is the file's path on the left side; pass it for renames, or
/// `None` to use `path` on both sides.
pub fn file_hunks(
    repo_path: &str,
    left: &str,
    right: &str,
    path: &str,
    old_path: Option<&str>,
) -> Result<Vec<Hunk>> {
    let repo = gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    let old_tree = resolve_tree(&repo, left)?;
    let new_tree = resolve_tree(&repo, right)?;

    let old = blob_at(&old_tree, old_path.unwrap_or(path))?.unwrap_or_default();
    let new = blob_at(&new_tree, path)?.unwrap_or_default();
    if is_binary(&old) || is_binary(&new) {
        return Ok(Vec::new());
    }
    Ok(hunks_for_blobs(&old, &new))
}

/// A blob's text at `rev`. `None` when the path is absent or binary.
pub fn file_content(repo_path: &str, rev: &str, path: &str) -> Result<Option<String>> {
    let repo = gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    let tree = resolve_tree(&repo, rev)?;
    match blob_at(&tree, path)? {
        Some(bytes) if !is_binary(&bytes) => Ok(Some(String::from_utf8_lossy(&bytes).into_owned())),
        _ => Ok(None),
    }
}

/// The full line-level detail of every changed file. Powers `--format json` and
/// the patch renderer; the GUI prefers per-file [`file_hunks`] for laziness.
pub fn diff_detail(repo_path: &str, left: &str, right: &str) -> Result<Vec<FileDiffDetail>> {
    let repo = gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))?;
    let old_tree = resolve_tree(&repo, left)?;
    let new_tree = resolve_tree(&repo, right)?;

    let mut out = Vec::new();
    let mut first_err: Option<Error> = None;

    old_tree
        .changes()
        .map_err(|e| Error::Git(e.to_string()))?
        .for_each_to_obtain_tree(&new_tree, |change| {
            if is_tree_change(&change) {
                return Ok(std::ops::ControlFlow::Continue(()));
            }
            let (path, old_path, status) = change_meta(&change);
            let old = match blob_at(&old_tree, old_path.as_deref().unwrap_or(&path)) {
                Ok(b) => b.unwrap_or_default(),
                Err(e) => {
                    first_err = Some(e);
                    return Ok(std::ops::ControlFlow::Break(()));
                }
            };
            let new = match blob_at(&new_tree, &path) {
                Ok(b) => b.unwrap_or_default(),
                Err(e) => {
                    first_err = Some(e);
                    return Ok(std::ops::ControlFlow::Break(()));
                }
            };
            let binary = is_binary(&old) || is_binary(&new);
            let hunks = if binary {
                Vec::new()
            } else {
                hunks_for_blobs(&old, &new)
            };
            out.push(FileDiffDetail {
                path,
                old_path,
                status,
                binary,
                hunks,
            });
            Ok::<_, std::convert::Infallible>(std::ops::ControlFlow::Continue(()))
        })
        .map_err(|e| Error::Git(e.to_string()))?;

    if let Some(e) = first_err {
        return Err(e);
    }
    Ok(out)
}

/// Render the diff as a git-style unified patch — the agent handoff format.
pub fn unified_diff(repo_path: &str, left: &str, right: &str) -> Result<String> {
    let detail = diff_detail(repo_path, left, right)?;
    let mut out = String::new();

    for f in &detail {
        let a = f.old_path.as_deref().unwrap_or(&f.path);
        let b = &f.path;
        out.push_str(&format!("diff --git a/{a} b/{b}\n"));

        if f.binary {
            out.push_str(&format!("Binary files a/{a} and b/{b} differ\n"));
            continue;
        }

        match f.status {
            FileStatus::Added => {
                out.push_str("--- /dev/null\n");
                out.push_str(&format!("+++ b/{b}\n"));
            }
            FileStatus::Deleted => {
                out.push_str(&format!("--- a/{a}\n"));
                out.push_str("+++ /dev/null\n");
            }
            _ => {
                out.push_str(&format!("--- a/{a}\n"));
                out.push_str(&format!("+++ b/{b}\n"));
            }
        }

        for h in &f.hunks {
            out.push_str(&format!(
                "@@ -{} +{} @@\n",
                hunk_range(h.old_start, h.old_lines),
                hunk_range(h.new_start, h.new_lines)
            ));
            for line in &h.lines {
                out.push(match line.kind {
                    DiffLineKind::Context => ' ',
                    DiffLineKind::Addition => '+',
                    DiffLineKind::Deletion => '-',
                });
                out.push_str(&line.content);
                out.push('\n');
            }
        }
    }

    Ok(out)
}

// --- internals --------------------------------------------------------------

/// True when a change concerns a directory (tree) entry rather than a file.
///
/// `gix`'s tree diff reports changed subtree entries alongside the files inside
/// them; we only ever want file-level changes (emitting a directory both as a
/// "file" and as the parent of other paths also corrupts the GUI's file tree).
fn is_tree_change(change: &gix::object::tree::diff::Change) -> bool {
    use gix::object::tree::diff::Change;
    let mode = match change {
        Change::Addition { entry_mode, .. }
        | Change::Deletion { entry_mode, .. }
        | Change::Modification { entry_mode, .. }
        | Change::Rewrite { entry_mode, .. } => entry_mode,
    };
    mode.is_tree()
}

/// Extract (right path, optional left path, status) from a tree-diff change.
fn change_meta(change: &gix::object::tree::diff::Change) -> (String, Option<String>, FileStatus) {
    use gix::object::tree::diff::Change;
    match change {
        Change::Addition { location, .. } => (location.to_string(), None, FileStatus::Added),
        Change::Deletion { location, .. } => (location.to_string(), None, FileStatus::Deleted),
        Change::Modification { location, .. } => (location.to_string(), None, FileStatus::Modified),
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
    }
}

/// The raw bytes of the blob at `path` in `tree`, or `None` if absent.
fn blob_at(tree: &gix::Tree, path: &str) -> Result<Option<Vec<u8>>> {
    match tree
        .lookup_entry_by_path(path)
        .map_err(|e| Error::Git(e.to_string()))?
    {
        Some(entry) => {
            let object = entry.id().object().map_err(|e| Error::Git(e.to_string()))?;
            Ok(Some(object.detach().data))
        }
        None => Ok(None),
    }
}

/// git's heuristic: a NUL byte in the first 8000 bytes means binary.
fn is_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8000).any(|&b| b == 0)
}

/// Run one blob diff and collect structured hunks with per-line numbers.
fn hunks_for_blobs(old: &[u8], new: &[u8]) -> Vec<Hunk> {
    use gix::diff::blob::unified_diff::ContextSize;
    use gix::diff::blob::{diff_with_slider_heuristics, Algorithm, InternedInput, UnifiedDiff};

    let input = InternedInput::new(old, new);
    let diff = diff_with_slider_heuristics(Algorithm::Histogram, &input);
    let collector = HunkCollector::default();
    UnifiedDiff::new(&diff, &input, collector, ContextSize::symmetrical(3))
        .consume()
        .unwrap_or_default()
}

#[derive(Default)]
struct HunkCollector {
    hunks: Vec<Hunk>,
}

impl gix::diff::blob::unified_diff::ConsumeHunk for HunkCollector {
    type Out = Vec<Hunk>;

    fn consume_hunk(
        &mut self,
        header: gix::diff::blob::unified_diff::HunkHeader,
        lines: &[(gix::diff::blob::unified_diff::DiffLineKind, &[u8])],
    ) -> std::io::Result<()> {
        use gix::diff::blob::unified_diff::DiffLineKind as GixKind;

        let mut old_no = header.before_hunk_start;
        let mut new_no = header.after_hunk_start;
        let mut out_lines = Vec::with_capacity(lines.len());

        for (kind, bytes) in lines {
            let content = strip_eol(&String::from_utf8_lossy(bytes));
            let line = match kind {
                GixKind::Context => {
                    let l = DiffLine {
                        kind: DiffLineKind::Context,
                        old_line: Some(old_no),
                        new_line: Some(new_no),
                        content,
                    };
                    old_no += 1;
                    new_no += 1;
                    l
                }
                GixKind::Add => {
                    let l = DiffLine {
                        kind: DiffLineKind::Addition,
                        old_line: None,
                        new_line: Some(new_no),
                        content,
                    };
                    new_no += 1;
                    l
                }
                GixKind::Remove => {
                    let l = DiffLine {
                        kind: DiffLineKind::Deletion,
                        old_line: Some(old_no),
                        new_line: None,
                        content,
                    };
                    old_no += 1;
                    l
                }
            };
            out_lines.push(line);
        }

        self.hunks.push(Hunk {
            old_start: header.before_hunk_start,
            old_lines: header.before_hunk_len,
            new_start: header.after_hunk_start,
            new_lines: header.after_hunk_len,
            lines: out_lines,
        });
        Ok(())
    }

    fn finish(self) -> Self::Out {
        self.hunks
    }
}

/// Format one side of a `@@ … @@` header the way git does: `,0` ranges point at
/// the line *before* the change (so an empty side reads `0,0`), and a length of
/// 1 omits the count.
fn hunk_range(start: u32, len: u32) -> String {
    match len {
        0 => format!("{},0", start.saturating_sub(1)),
        1 => format!("{start}"),
        _ => format!("{start},{len}"),
    }
}

fn strip_eol(s: &str) -> String {
    s.strip_suffix('\n')
        .map(|s| s.strip_suffix('\r').unwrap_or(s))
        .unwrap_or(s)
        .to_string()
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

    /// A two-commit fixture: keep.txt modified, gone.txt deleted, new.txt added.
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        write(p, "keep.txt", "a\nb\nc\n");
        write(p, "gone.txt", "remove me\n");
        git(p, &["add", "."]);
        git(p, &["commit", "-qm", "first"]);
        write(p, "keep.txt", "a\nB\nc\nd\n");
        write(p, "new.txt", "brand new\n");
        std::fs::remove_file(p.join("gone.txt")).unwrap();
        git(p, &["add", "-A"]);
        git(p, &["commit", "-qm", "second"]);
        dir
    }

    #[test]
    fn summary_reports_added_modified_deleted() {
        let dir = fixture();
        let p = dir.path().to_str().unwrap();
        let summary = diff_summary(p, "HEAD^", "HEAD").unwrap();
        let by = |name: &str| {
            summary
                .files
                .iter()
                .find(|f| f.path == name)
                .unwrap()
                .clone()
        };
        assert_eq!(by("new.txt").status, FileStatus::Added);
        assert_eq!(by("gone.txt").status, FileStatus::Deleted);
        assert_eq!(by("keep.txt").status, FileStatus::Modified);
        assert!(summary.total_additions >= 2);
    }

    #[test]
    fn file_hunks_carry_line_numbers() {
        let dir = fixture();
        let p = dir.path().to_str().unwrap();
        let hunks = file_hunks(p, "HEAD^", "HEAD", "keep.txt", None).unwrap();
        assert!(!hunks.is_empty());
        let lines: Vec<_> = hunks.iter().flat_map(|h| &h.lines).collect();
        // "b" -> "B" is a delete + add; "d" is a pure addition.
        let added: Vec<_> = lines
            .iter()
            .filter(|l| l.kind == DiffLineKind::Addition)
            .collect();
        assert!(added
            .iter()
            .any(|l| l.content == "B" && l.new_line.is_some()));
        assert!(added.iter().any(|l| l.content == "d"));
        assert!(lines
            .iter()
            .any(|l| l.kind == DiffLineKind::Deletion && l.content == "b" && l.old_line.is_some()));
    }

    #[test]
    fn unified_diff_renders_a_patch() {
        let dir = fixture();
        let p = dir.path().to_str().unwrap();
        let patch = unified_diff(p, "HEAD^", "HEAD").unwrap();
        assert!(patch.contains("diff --git a/keep.txt b/keep.txt"));
        assert!(patch.contains("--- /dev/null")); // new.txt addition
        assert!(patch.contains("+++ /dev/null")); // gone.txt deletion
        assert!(patch.contains("@@"));
        assert!(patch.contains("\n+d"));
        assert!(patch.contains("\n-b"));
    }

    #[test]
    fn file_content_reads_each_side() {
        let dir = fixture();
        let p = dir.path().to_str().unwrap();
        assert_eq!(
            file_content(p, "HEAD^", "keep.txt").unwrap().unwrap(),
            "a\nb\nc\n"
        );
        assert_eq!(
            file_content(p, "HEAD", "new.txt").unwrap().unwrap(),
            "brand new\n"
        );
        assert!(file_content(p, "HEAD", "gone.txt").unwrap().is_none());
    }

    #[test]
    fn summary_reports_only_files_not_directories() {
        // Regression: gix's tree diff also surfaces changed *directory* entries.
        // We must emit only files, or the GUI file tree (which treats every path
        // as a leaf) gets a path that is both a file and a parent, and crashes.
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        std::fs::create_dir_all(p.join("src/nested")).unwrap();
        write(p, "src/nested/deep.txt", "one\n");
        git(p, &["add", "."]);
        git(p, &["commit", "-qm", "first"]);
        write(p, "src/nested/deep.txt", "one\ntwo\n");
        git(p, &["add", "-A"]);
        git(p, &["commit", "-qm", "second"]);

        let summary = diff_summary(p.to_str().unwrap(), "HEAD^", "HEAD").unwrap();
        assert_eq!(
            summary
                .files
                .iter()
                .map(|f| f.path.as_str())
                .collect::<Vec<_>>(),
            vec!["src/nested/deep.txt"],
            "only the changed file should appear, no `src` or `src/nested` dirs"
        );
    }

    #[test]
    fn unresolvable_ref_errors() {
        let dir = fixture();
        let p = dir.path().to_str().unwrap();
        let err = diff_summary(p, "HEAD", "no-such-ref").unwrap_err();
        assert!(matches!(err, Error::Git(_)));
    }
}
