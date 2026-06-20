//! Tauri desktop surface for ugit.
//!
//! Like the CLI, this is a thin shell over `ugit-core`: every command opens the
//! shared store and delegates. Both surfaces therefore read and write the exact
//! same database (see `ugit_core::store`).

use ugit_core::model::{DiffKind, DiffSummary};
use ugit_core::{diff, store, Comment, Diff};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());

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
            list_comments,
            add_comment
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
