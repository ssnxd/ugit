//! `ugit-core` — the shared brain behind both ugit surfaces.
//!
//! The desktop GUI (`src-tauri`) and the `ugit` CLI both depend on this crate
//! and do nothing of substance themselves: they are thin shells that open the
//! store via [`store::open`] and call into here. Keeping all logic — and, most
//! importantly, the store path ([`store::data_dir`]) — in one place is what
//! guarantees the two surfaces share one database and behave identically.

pub mod diff;
pub mod model;
pub mod repo;
pub mod store;

pub use model::{
    BranchRef, Comment, CommitInfo, Diff, DiffKind, DiffLine, DiffLineKind, DiffListItem,
    DiffSummary, FileChange, FileDiffDetail, FileStatus, Hunk, RecentRepo, RepoInfo, TagRef,
    WorktreeInfo,
};

/// Crate-wide error type. Surfaces map this to their own representation
/// (the GUI maps to `String` for IPC; the CLI maps via `anyhow`).
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("store error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("could not resolve the ugit data directory")]
    NoDataDir,
    #[error("diff not found: {0}")]
    DiffNotFound(String),
    #[error("comment not found: {0}")]
    CommentNotFound(String),
    #[error("git error: {0}")]
    Git(String),
}

pub type Result<T> = std::result::Result<T, Error>;
