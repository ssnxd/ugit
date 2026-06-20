//! Repository introspection — the data behind the GUI's repo/ref pickers.
//!
//! Everything here is read-only `gix` queries: branches, tags, worktrees, the
//! commit log, and top-level metadata. ugit needs these only so the user can
//! choose *what* to diff; ugit never mutates the repository.

use crate::model::{BranchRef, CommitInfo, RepoInfo, TagRef, WorktreeInfo};
use crate::{Error, Result};

fn open(repo_path: &str) -> Result<gix::Repository> {
    gix::open(repo_path).map_err(|e| Error::Git(e.to_string()))
}

/// Top-level metadata: display name and the current branch (or detached state).
pub fn repo_info(repo_path: &str) -> Result<RepoInfo> {
    let repo = open(repo_path)?;
    let head = repo
        .head_name()
        .map_err(|e| Error::Git(e.to_string()))?
        .map(|name| name.shorten().to_string());
    let name = repo
        .workdir()
        .and_then(|p| p.file_name())
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| repo_path.trim_end_matches('/').to_string());
    Ok(RepoInfo {
        path: repo_path.to_string(),
        name,
        detached: head.is_none(),
        head,
    })
}

/// Local and remote branches, with the current branch flagged.
pub fn branches(repo_path: &str) -> Result<Vec<BranchRef>> {
    let repo = open(repo_path)?;
    let current = repo
        .head_name()
        .map_err(|e| Error::Git(e.to_string()))?
        .map(|n| n.as_bstr().to_string());

    let platform = repo.references().map_err(|e| Error::Git(e.to_string()))?;
    let mut out = Vec::new();

    let mut collect = |iter: gix::reference::iter::Iter<'_, '_>, is_remote: bool| -> Result<()> {
        for reference in iter {
            let reference = reference.map_err(|e| Error::Git(e.to_string()))?;
            let full_name = reference.name().as_bstr().to_string();
            out.push(BranchRef {
                name: reference.name().shorten().to_string(),
                is_current: !is_remote && current.as_deref() == Some(full_name.as_str()),
                target: reference.id().to_string(),
                full_name,
                is_remote,
            });
        }
        Ok(())
    };

    collect(
        platform
            .local_branches()
            .map_err(|e| Error::Git(e.to_string()))?,
        false,
    )?;
    collect(
        platform
            .remote_branches()
            .map_err(|e| Error::Git(e.to_string()))?,
        true,
    )?;
    Ok(out)
}

/// All tags.
pub fn tags(repo_path: &str) -> Result<Vec<TagRef>> {
    let repo = open(repo_path)?;
    let platform = repo.references().map_err(|e| Error::Git(e.to_string()))?;
    let mut out = Vec::new();
    for reference in platform.tags().map_err(|e| Error::Git(e.to_string()))? {
        let reference = reference.map_err(|e| Error::Git(e.to_string()))?;
        out.push(TagRef {
            name: reference.name().shorten().to_string(),
            full_name: reference.name().as_bstr().to_string(),
            target: reference.id().to_string(),
        });
    }
    Ok(out)
}

/// The commit log reachable from `rev`, newest first, paginated.
pub fn commits(repo_path: &str, rev: &str, limit: usize, offset: usize) -> Result<Vec<CommitInfo>> {
    let repo = open(repo_path)?;
    let tip = repo
        .rev_parse_single(rev)
        .map_err(|e| Error::Git(format!("could not resolve '{rev}': {e}")))?
        .detach();

    let walk = repo
        .rev_walk(Some(tip))
        .sorting(gix::revision::walk::Sorting::ByCommitTime(
            Default::default(),
        ))
        .all()
        .map_err(|e| Error::Git(e.to_string()))?;

    let mut out = Vec::new();
    for info in walk.skip(offset).take(limit) {
        let info = info.map_err(|e| Error::Git(e.to_string()))?;
        let id = info.id.to_string();
        let commit = repo
            .find_commit(info.id)
            .map_err(|e| Error::Git(e.to_string()))?;
        let summary = commit
            .message()
            .map(|m| m.summary().to_string())
            .unwrap_or_default();
        let author_name = commit
            .author()
            .map(|a| a.name.to_string())
            .unwrap_or_default();
        let time = info
            .commit_time
            .or_else(|| commit.time().ok().map(|t| t.seconds))
            .unwrap_or(0);
        out.push(CommitInfo {
            short_id: id.chars().take(8).collect(),
            id,
            summary,
            author_name,
            time,
        });
    }
    Ok(out)
}

/// All worktrees, including the main one.
pub fn worktrees(repo_path: &str) -> Result<Vec<WorktreeInfo>> {
    let repo = open(repo_path)?;
    let mut out = Vec::new();

    if let Some(workdir) = repo.workdir() {
        let branch = repo
            .head_name()
            .ok()
            .flatten()
            .map(|n| n.shorten().to_string());
        out.push(WorktreeInfo {
            path: workdir.to_string_lossy().into_owned(),
            is_main: true,
            is_locked: false,
            branch,
        });
    }

    for proxy in repo.worktrees().map_err(Error::Io)? {
        let base = proxy.base().map_err(Error::Io)?;
        out.push(WorktreeInfo {
            path: base.to_string_lossy().into_owned(),
            is_main: false,
            is_locked: proxy.is_locked(),
            branch: None,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

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

    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path();
        git(p, &["init", "-q", "-b", "main"]);
        std::fs::write(p.join("a.txt"), "1\n").unwrap();
        git(p, &["add", "."]);
        git(p, &["commit", "-qm", "first commit"]);
        std::fs::write(p.join("a.txt"), "2\n").unwrap();
        git(p, &["commit", "-qam", "second commit"]);
        git(p, &["branch", "feature"]);
        git(p, &["tag", "v1.0"]);
        dir
    }

    #[test]
    fn lists_branches_with_current() {
        let dir = fixture();
        let bs = branches(dir.path().to_str().unwrap()).unwrap();
        let main = bs.iter().find(|b| b.name == "main").unwrap();
        assert!(main.is_current);
        assert!(bs.iter().any(|b| b.name == "feature" && !b.is_current));
    }

    #[test]
    fn lists_tags() {
        let dir = fixture();
        let ts = tags(dir.path().to_str().unwrap()).unwrap();
        assert!(ts.iter().any(|t| t.name == "v1.0"));
    }

    #[test]
    fn lists_commits_newest_first() {
        let dir = fixture();
        let cs = commits(dir.path().to_str().unwrap(), "HEAD", 10, 0).unwrap();
        assert_eq!(cs.len(), 2);
        assert_eq!(cs[0].summary, "second commit");
        assert_eq!(cs[1].summary, "first commit");
        assert_eq!(cs[0].author_name, "t");
        assert!(cs[0].short_id.len() <= 8);
    }

    #[test]
    fn commits_paginate() {
        let dir = fixture();
        let page = commits(dir.path().to_str().unwrap(), "HEAD", 1, 1).unwrap();
        assert_eq!(page.len(), 1);
        assert_eq!(page[0].summary, "first commit");
    }

    #[test]
    fn repo_info_reports_current_branch() {
        let dir = fixture();
        let info = repo_info(dir.path().to_str().unwrap()).unwrap();
        assert_eq!(info.head.as_deref(), Some("main"));
        assert!(!info.detached);
    }

    #[test]
    fn worktrees_include_main() {
        let dir = fixture();
        let ws = worktrees(dir.path().to_str().unwrap()).unwrap();
        assert!(ws.iter().any(|w| w.is_main));
    }
}
