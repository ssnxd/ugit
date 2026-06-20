//! The shared on-disk store — the single source of truth both ugit surfaces talk to.
//!
//! The GUI and the CLI are separate OS processes with no shared runtime, so the
//! one thing they MUST agree on is *where* the database lives. That agreement is
//! [`data_dir`]: both surfaces call it (never Tauri's own path resolver, which
//! the CLI has no access to), so the path can never drift between them.
//!
//! Concurrency: because two processes may open the same file at once, every
//! connection runs in WAL mode with a busy-timeout, which lets readers and a
//! writer coexist and makes a contended write wait rather than fail.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use directories::BaseDirs;
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::model::{Comment, Diff, DiffKind, DiffListItem, RecentRepo};
use crate::{Error, Result};

/// Application identifier. MUST stay in sync with `identifier` in
/// `src-tauri/tauri.conf.json` — it is the leaf directory of [`data_dir`].
pub const IDENTIFIER: &str = "com.surajnegi.ugit";

/// The directory ugit stores everything in, identical for the GUI and the CLI.
///
/// - macOS:   `~/Library/Application Support/com.surajnegi.ugit/`
/// - Linux:   `~/.local/share/com.surajnegi.ugit/` (respects `$XDG_DATA_HOME`)
/// - Windows: `%APPDATA%\com.surajnegi.ugit\`
pub fn data_dir() -> Result<PathBuf> {
    let base = BaseDirs::new().ok_or(Error::NoDataDir)?;
    Ok(base.data_dir().join(IDENTIFIER))
}

/// Path to the SQLite database file inside [`data_dir`].
pub fn db_path() -> Result<PathBuf> {
    Ok(data_dir()?.join("ugit.db"))
}

/// Open the shared database, creating the data directory and running migrations
/// if needed. This is the entry point every command (GUI or CLI) starts from.
pub fn open() -> Result<Connection> {
    let dir = data_dir()?;
    std::fs::create_dir_all(&dir)?;
    open_at(dir.join("ugit.db"))
}

/// Open (or create) a database at an explicit path. Used by [`open`] and by
/// tests that point at a temp file.
pub fn open_at<P: AsRef<Path>>(path: P) -> Result<Connection> {
    let conn = Connection::open(path)?;
    // WAL + busy_timeout: the foundation for safe concurrent GUI + CLI access.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "busy_timeout", 5000)?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS diffs (
            id         TEXT PRIMARY KEY,
            repo_path  TEXT NOT NULL,
            left_ref   TEXT NOT NULL,
            right_ref  TEXT NOT NULL,
            kind       TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS comments (
            id           TEXT PRIMARY KEY,
            diff_id      TEXT NOT NULL REFERENCES diffs(id) ON DELETE CASCADE,
            file_path    TEXT,
            line         INTEGER,
            side         TEXT,
            body         TEXT NOT NULL,
            line_content TEXT,
            created_at   INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_comments_diff ON comments(diff_id);
        CREATE INDEX IF NOT EXISTS idx_diffs_repo_created ON diffs(repo_path, created_at DESC);
        CREATE TABLE IF NOT EXISTS recent_repos (
            path        TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            last_opened INTEGER NOT NULL
        );",
    )?;

    // Additive migration for stores created before `line_content` existed.
    // `ALTER TABLE ADD COLUMN` errors if the column is already present; ignore
    // only that case.
    if let Err(e) = conn.execute("ALTER TABLE comments ADD COLUMN line_content TEXT", []) {
        let msg = e.to_string();
        if !msg.contains("duplicate column name") {
            return Err(Error::Sqlite(e));
        }
    }
    Ok(())
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Persist a new diff, returning the stored row (with its generated id).
pub fn insert_diff(
    conn: &Connection,
    repo_path: &str,
    left_ref: &str,
    right_ref: &str,
    kind: DiffKind,
) -> Result<Diff> {
    let diff = Diff {
        id: Uuid::new_v4().to_string(),
        repo_path: repo_path.to_string(),
        left_ref: left_ref.to_string(),
        right_ref: right_ref.to_string(),
        kind,
        created_at: now(),
    };
    conn.execute(
        "INSERT INTO diffs (id, repo_path, left_ref, right_ref, kind, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            diff.id,
            diff.repo_path,
            diff.left_ref,
            diff.right_ref,
            diff.kind.as_str(),
            diff.created_at
        ],
    )?;
    Ok(diff)
}

/// Get the diff for this exact comparison, creating it only if it doesn't exist.
///
/// Diffs are deduped by `(repo_path, left_ref, right_ref, kind)` so that
/// re-opening the same comparison (from the GUI or the CLI, now or later) returns
/// the *same* id — and therefore the same accumulated comments. Without this,
/// every `ugit diff` would mint a fresh id and comments would scatter.
pub fn get_or_create_diff(
    conn: &Connection,
    repo_path: &str,
    left_ref: &str,
    right_ref: &str,
    kind: DiffKind,
) -> Result<Diff> {
    let existing = conn
        .query_row(
            "SELECT id, repo_path, left_ref, right_ref, kind, created_at
             FROM diffs
             WHERE repo_path = ?1 AND left_ref = ?2 AND right_ref = ?3 AND kind = ?4",
            params![repo_path, left_ref, right_ref, kind.as_str()],
            row_to_diff,
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(Error::Sqlite(other)),
        })?;

    match existing {
        Some(diff) => Ok(diff),
        None => insert_diff(conn, repo_path, left_ref, right_ref, kind),
    }
}

/// Recent diffs (newest first) with their comment counts, optionally filtered to
/// one repository. Powers `ugit diffs`.
pub fn list_diffs(
    conn: &Connection,
    repo: Option<&str>,
    limit: usize,
) -> Result<Vec<DiffListItem>> {
    let sql = "SELECT d.id, d.repo_path, d.left_ref, d.right_ref, d.kind, d.created_at,
                      (SELECT COUNT(*) FROM comments c WHERE c.diff_id = d.id) AS comment_count
               FROM diffs d
               WHERE (?1 IS NULL OR d.repo_path = ?1)
               ORDER BY d.created_at DESC LIMIT ?2";
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![repo, limit as i64], |row| {
        Ok(DiffListItem {
            diff: row_to_diff(row)?,
            comment_count: row.get(6)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Look up a diff by id.
pub fn get_diff(conn: &Connection, id: &str) -> Result<Diff> {
    conn.query_row(
        "SELECT id, repo_path, left_ref, right_ref, kind, created_at
         FROM diffs WHERE id = ?1",
        params![id],
        row_to_diff,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Error::DiffNotFound(id.to_string()),
        other => Error::Sqlite(other),
    })
}

/// Add a comment to a diff, returning the stored row.
pub fn add_comment(
    conn: &Connection,
    diff_id: &str,
    file_path: Option<&str>,
    line: Option<i64>,
    side: Option<&str>,
    body: &str,
    line_content: Option<&str>,
) -> Result<Comment> {
    // Ensure the diff exists so we return a friendly error rather than a raw FK failure.
    get_diff(conn, diff_id)?;
    let comment = Comment {
        id: Uuid::new_v4().to_string(),
        diff_id: diff_id.to_string(),
        file_path: file_path.map(str::to_string),
        line,
        side: side.map(str::to_string),
        body: body.to_string(),
        line_content: line_content.map(str::to_string),
        created_at: now(),
    };
    conn.execute(
        "INSERT INTO comments (id, diff_id, file_path, line, side, body, line_content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            comment.id,
            comment.diff_id,
            comment.file_path,
            comment.line,
            comment.side,
            comment.body,
            comment.line_content,
            comment.created_at
        ],
    )?;
    Ok(comment)
}

/// Edit a comment's body, returning the updated row.
pub fn update_comment(conn: &Connection, id: &str, body: &str) -> Result<Comment> {
    let changed = conn.execute(
        "UPDATE comments SET body = ?2 WHERE id = ?1",
        params![id, body],
    )?;
    if changed == 0 {
        return Err(Error::CommentNotFound(id.to_string()));
    }
    conn.query_row(
        "SELECT id, diff_id, file_path, line, side, body, line_content, created_at
         FROM comments WHERE id = ?1",
        params![id],
        row_to_comment,
    )
    .map_err(Error::Sqlite)
}

/// Delete a comment by id.
pub fn delete_comment(conn: &Connection, id: &str) -> Result<()> {
    let changed = conn.execute("DELETE FROM comments WHERE id = ?1", params![id])?;
    if changed == 0 {
        return Err(Error::CommentNotFound(id.to_string()));
    }
    Ok(())
}

/// All comments on a diff, oldest first.
pub fn comments_for_diff(conn: &Connection, diff_id: &str) -> Result<Vec<Comment>> {
    // Order by rowid (monotonic per insert) so the feed is stable insertion
    // order even when multiple comments land in the same wall-clock second.
    let mut stmt = conn.prepare(
        "SELECT id, diff_id, file_path, line, side, body, line_content, created_at
         FROM comments WHERE diff_id = ?1 ORDER BY rowid ASC",
    )?;
    let rows = stmt.query_map(params![diff_id], row_to_comment)?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

/// Record (or refresh) a repository in the recent list, stamping it as just opened.
pub fn record_repo(conn: &Connection, path: &str, name: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO recent_repos (path, name, last_opened) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened = excluded.last_opened",
        params![path, name, now()],
    )?;
    Ok(())
}

/// The most-recently-opened repositories, newest first.
pub fn list_recent_repos(conn: &Connection, limit: usize) -> Result<Vec<RecentRepo>> {
    let mut stmt = conn.prepare(
        "SELECT path, name, last_opened FROM recent_repos
         ORDER BY last_opened DESC LIMIT ?1",
    )?;
    let rows = stmt.query_map(params![limit as i64], |row| {
        Ok(RecentRepo {
            path: row.get(0)?,
            name: row.get(1)?,
            last_opened: row.get(2)?,
        })
    })?;
    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }
    Ok(out)
}

fn row_to_diff(row: &rusqlite::Row) -> rusqlite::Result<Diff> {
    let kind_str: String = row.get(4)?;
    Ok(Diff {
        id: row.get(0)?,
        repo_path: row.get(1)?,
        left_ref: row.get(2)?,
        right_ref: row.get(3)?,
        kind: DiffKind::from_kebab(&kind_str).unwrap_or(DiffKind::RefToRef),
        created_at: row.get(5)?,
    })
}

fn row_to_comment(row: &rusqlite::Row) -> rusqlite::Result<Comment> {
    Ok(Comment {
        id: row.get(0)?,
        diff_id: row.get(1)?,
        file_path: row.get(2)?,
        line: row.get(3)?,
        side: row.get(4)?,
        body: row.get(5)?,
        line_content: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_migrate_insert_read_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();

        let diff =
            insert_diff(&conn, "/repo", "main", "feature", DiffKind::BranchToBranch).unwrap();
        let fetched = get_diff(&conn, &diff.id).unwrap();
        assert_eq!(fetched.left_ref, "main");
        assert_eq!(fetched.kind, DiffKind::BranchToBranch);

        add_comment(
            &conn,
            &diff.id,
            Some("src/lib.rs"),
            Some(10),
            Some("right"),
            "looks off",
            Some("let x = old;"),
        )
        .unwrap();
        add_comment(&conn, &diff.id, None, None, None, "general note", None).unwrap();

        let comments = comments_for_diff(&conn, &diff.id).unwrap();
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].body, "looks off");
    }

    #[test]
    fn second_connection_sees_first_writes() {
        // Proves the "two surfaces, one store" guarantee at the DB level:
        // a separate connection to the same file reads what the first wrote.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("ugit.db");

        let diff_id = {
            let a = open_at(&path).unwrap();
            insert_diff(&a, "/repo", "a", "b", DiffKind::RefToRef)
                .unwrap()
                .id
        };

        let b = open_at(&path).unwrap();
        add_comment(
            &b,
            &diff_id,
            None,
            None,
            None,
            "from the other process",
            None,
        )
        .unwrap();
        assert_eq!(comments_for_diff(&b, &diff_id).unwrap().len(), 1);
    }

    #[test]
    fn list_diffs_with_counts_and_repo_filter() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();

        let a = insert_diff(&conn, "/repo-a", "x", "y", DiffKind::RefToRef).unwrap();
        let _b = insert_diff(&conn, "/repo-b", "m", "n", DiffKind::BranchToBranch).unwrap();
        add_comment(&conn, &a.id, None, None, None, "one", None).unwrap();
        add_comment(&conn, &a.id, None, None, None, "two", None).unwrap();

        let all = list_diffs(&conn, None, 10).unwrap();
        assert_eq!(all.len(), 2);
        let a_row = all.iter().find(|d| d.diff.id == a.id).unwrap();
        assert_eq!(a_row.comment_count, 2);

        let only_b = list_diffs(&conn, Some("/repo-b"), 10).unwrap();
        assert_eq!(only_b.len(), 1);
        assert_eq!(only_b[0].diff.repo_path, "/repo-b");
        assert_eq!(only_b[0].comment_count, 0);
    }

    #[test]
    fn recent_repos_upsert_and_order() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();

        record_repo(&conn, "/a", "a").unwrap();
        record_repo(&conn, "/b", "b").unwrap();
        record_repo(&conn, "/a", "a-renamed").unwrap(); // re-open a → most recent

        let recents = list_recent_repos(&conn, 10).unwrap();
        assert_eq!(recents.len(), 2, "upsert, not duplicate");
        assert_eq!(recents[0].path, "/a");
        assert_eq!(recents[0].name, "a-renamed");
    }

    #[test]
    fn comment_persists_line_content_snapshot() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();
        let diff = insert_diff(&conn, "/repo", "a", "b", DiffKind::RefToRef).unwrap();
        add_comment(
            &conn,
            &diff.id,
            Some("src/lib.rs"),
            Some(10),
            Some("right"),
            "note",
            Some("let x = old;"),
        )
        .unwrap();
        let stored = &comments_for_diff(&conn, &diff.id).unwrap()[0];
        assert_eq!(stored.line_content.as_deref(), Some("let x = old;"));
    }

    #[test]
    fn edit_and_delete_comment() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();
        let diff = insert_diff(&conn, "/repo", "a", "b", DiffKind::RefToRef).unwrap();
        let c = add_comment(&conn, &diff.id, None, None, None, "first", None).unwrap();

        let updated = update_comment(&conn, &c.id, "edited").unwrap();
        assert_eq!(updated.body, "edited");
        assert_eq!(
            comments_for_diff(&conn, &diff.id).unwrap()[0].body,
            "edited"
        );

        delete_comment(&conn, &c.id).unwrap();
        assert!(comments_for_diff(&conn, &diff.id).unwrap().is_empty());

        assert!(matches!(
            delete_comment(&conn, &c.id).unwrap_err(),
            Error::CommentNotFound(_)
        ));
    }

    #[test]
    fn comment_on_missing_diff_errors() {
        let dir = tempfile::tempdir().unwrap();
        let conn = open_at(dir.path().join("ugit.db")).unwrap();
        let err = add_comment(&conn, "nope", None, None, None, "x", None).unwrap_err();
        assert!(matches!(err, Error::DiffNotFound(_)));
    }
}
