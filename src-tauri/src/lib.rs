//! Tauri desktop surface for ugit.
//!
//! Like the CLI, this is a thin shell over `ugit-core`: every command opens the
//! shared store and delegates. Both surfaces therefore read and write the exact
//! same database (see `ugit_core::store`).

use ugit_core::model::{DiffKind, DiffSummary};
use ugit_core::{
    diff, repo, store, BranchRef, Comment, CommitInfo, Diff, Hunk, RecentRepo, RepoInfo, TagRef,
    WorktreeInfo,
};

/// Map a core error to a String so it surfaces as a rejected promise on the frontend.
fn to_err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Compute and persist a diff between two refs. Returns the stored diff (with its id).
#[tauri::command]
fn compute_diff(
    repo_path: String,
    left: String,
    right: String,
    kind: DiffKind,
) -> Result<Diff, String> {
    let conn = store::open().map_err(to_err)?;
    diff::compute_diff(&conn, &repo_path, &left, &right, kind).map_err(to_err)
}

/// The file-level summary of a diff between two refs (no persistence needed).
#[tauri::command]
fn diff_summary(repo_path: String, left: String, right: String) -> Result<DiffSummary, String> {
    diff::diff_summary(&repo_path, &left, &right).map_err(to_err)
}

/// Validate and open a repo: record it in the recent list and return its metadata.
#[tauri::command]
fn open_repo(repo_path: String) -> Result<RepoInfo, String> {
    let info = repo::repo_info(&repo_path).map_err(to_err)?;
    let conn = store::open().map_err(to_err)?;
    store::record_repo(&conn, &info.path, &info.name).map_err(to_err)?;
    Ok(info)
}

/// The most-recently-opened repositories.
#[tauri::command]
fn recent_repos(limit: usize) -> Result<Vec<RecentRepo>, String> {
    let conn = store::open().map_err(to_err)?;
    store::list_recent_repos(&conn, limit).map_err(to_err)
}

/// Local + remote branches, current branch flagged.
#[tauri::command]
fn branches(repo_path: String) -> Result<Vec<BranchRef>, String> {
    repo::branches(&repo_path).map_err(to_err)
}

/// All tags.
#[tauri::command]
fn tags(repo_path: String) -> Result<Vec<TagRef>, String> {
    repo::tags(&repo_path).map_err(to_err)
}

/// All worktrees, including the main one.
#[tauri::command]
fn worktrees(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    repo::worktrees(&repo_path).map_err(to_err)
}

/// The commit log reachable from `rev`, newest first, paginated.
#[tauri::command]
fn commits(
    repo_path: String,
    rev: String,
    limit: usize,
    offset: usize,
) -> Result<Vec<CommitInfo>, String> {
    repo::commits(&repo_path, &rev, limit, offset).map_err(to_err)
}

/// Line-level hunks for a single file (the lazy, per-file path the diff view uses).
#[tauri::command]
fn file_hunks(
    repo_path: String,
    left: String,
    right: String,
    path: String,
    old_path: Option<String>,
) -> Result<Vec<Hunk>, String> {
    diff::file_hunks(&repo_path, &left, &right, &path, old_path.as_deref()).map_err(to_err)
}

/// A blob's text at a ref — the before/after sides fed to the diff renderer.
#[tauri::command]
fn file_content(repo_path: String, rev: String, path: String) -> Result<Option<String>, String> {
    diff::file_content(&repo_path, &rev, &path).map_err(to_err)
}

/// All comments on a diff — the same data `ugit comment <diff-id>` exports.
#[tauri::command]
fn list_comments(diff_id: String) -> Result<Vec<Comment>, String> {
    let conn = store::open().map_err(to_err)?;
    store::comments_for_diff(&conn, &diff_id).map_err(to_err)
}

/// Attach a comment to a diff.
#[tauri::command]
fn add_comment(
    diff_id: String,
    file_path: Option<String>,
    line: Option<i64>,
    side: Option<String>,
    body: String,
) -> Result<Comment, String> {
    let conn = store::open().map_err(to_err)?;
    store::add_comment(
        &conn,
        &diff_id,
        file_path.as_deref(),
        line,
        side.as_deref(),
        &body,
    )
    .map_err(to_err)
}

/// Edit a comment's body.
#[tauri::command]
fn update_comment(id: String, body: String) -> Result<Comment, String> {
    let conn = store::open().map_err(to_err)?;
    store::update_comment(&conn, &id, &body).map_err(to_err)
}

/// Delete a comment.
#[tauri::command]
fn delete_comment(id: String) -> Result<(), String> {
    let conn = store::open().map_err(to_err)?;
    store::delete_comment(&conn, &id).map_err(to_err)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .setup(|app| {
                // Check for updates from GitHub Releases on launch, silently
                // doing nothing if there is no update or the check fails.
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = check_for_updates(handle).await {
                        eprintln!("update check failed: {e}");
                    }
                });
                Ok(())
            });
    }

    builder
        .invoke_handler(tauri::generate_handler![
            compute_diff,
            diff_summary,
            file_hunks,
            file_content,
            open_repo,
            recent_repos,
            branches,
            tags,
            worktrees,
            commits,
            list_comments,
            add_comment,
            update_comment,
            delete_comment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(desktop)]
async fn check_for_updates(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_updater::UpdaterExt;

    if let Some(update) = app.updater()?.check().await? {
        update.download_and_install(|_, _| {}, || {}).await?;
        app.restart();
    }
    Ok(())
}
