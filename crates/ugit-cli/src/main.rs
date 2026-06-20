//! `ugit` — the command-line surface.
//!
//! Every subcommand opens the shared store via `ugit_core::store::open()` and
//! delegates to `ugit-core`. There is no ugit logic here that the desktop GUI
//! doesn't also go through — the CLI is deliberately a thin shell so the two
//! surfaces stay in lockstep over the same database.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};

use ugit_core::model::{DiffKind, DiffSummary, FileStatus};
use ugit_core::{diff, store, Comment};

#[derive(Parser)]
#[command(
    name = "ugit",
    about = "Diff-focused git client for the agent era (CLI surface)",
    version
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Compute and persist a diff between two refs; prints the new diff-id.
    Diff {
        /// Left side of the comparison (branch, commit, ref, …).
        left: String,
        /// Right side of the comparison.
        right: String,
        /// Repository path (defaults to the current directory).
        #[arg(long, default_value = ".")]
        repo: String,
        /// What kind of comparison this is.
        #[arg(long, value_enum, default_value_t = KindArg::RefToRef)]
        kind: KindArg,
        /// Output format: a `--stat`-style listing, a unified patch, or JSON.
        #[arg(long, value_enum, default_value_t = DiffFormat::Stat)]
        format: DiffFormat,
    },

    /// Export every comment on a diff as JSON or Markdown — the agent handoff.
    Comment {
        /// The diff-id (as printed by `ugit diff`).
        diff_id: String,
        /// Output format.
        #[arg(long, value_enum, default_value_t = Format::Json)]
        format: Format,
    },

    /// Attach a comment to a diff.
    CommentAdd {
        /// The diff-id to comment on.
        diff_id: String,
        /// The comment text.
        #[arg(long)]
        body: String,
        /// File the comment anchors to.
        #[arg(long)]
        file: Option<String>,
        /// Line the comment anchors to.
        #[arg(long)]
        line: Option<i64>,
        /// Side of the diff ("left" or "right").
        #[arg(long)]
        side: Option<String>,
    },
}

#[derive(Copy, Clone, ValueEnum)]
enum KindArg {
    BranchToBranch,
    WorktreeToWorktree,
    CommitToCommit,
    RefToRef,
}

impl From<KindArg> for DiffKind {
    fn from(k: KindArg) -> Self {
        match k {
            KindArg::BranchToBranch => DiffKind::BranchToBranch,
            KindArg::WorktreeToWorktree => DiffKind::WorktreeToWorktree,
            KindArg::CommitToCommit => DiffKind::CommitToCommit,
            KindArg::RefToRef => DiffKind::RefToRef,
        }
    }
}

#[derive(Copy, Clone, ValueEnum)]
enum Format {
    Json,
    Md,
}

#[derive(Copy, Clone, ValueEnum)]
enum DiffFormat {
    /// diff-id on line 1, then a `git diff --stat`-style file listing.
    Stat,
    /// A git-style unified patch — the agent handoff format.
    Patch,
    /// The full structured diff (files + hunks + lines) as JSON.
    Json,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    let conn = store::open().context("opening the ugit store")?;

    match cli.command {
        Command::Diff {
            left,
            right,
            repo,
            kind,
            format,
        } => {
            // Always register the diff so its id is available for commenting,
            // regardless of how we render it.
            let diff = diff::compute_diff(&conn, &repo, &left, &right, kind.into())
                .context("computing diff")?;
            match format {
                DiffFormat::Stat => {
                    let summary =
                        diff::diff_summary(&repo, &left, &right).context("computing diff")?;
                    // First line is the stable diff-id so `id=$(ugit diff a b | head -1)`
                    // keeps working; the file summary follows.
                    println!("{}", diff.id);
                    print!("{}", render_summary(&summary));
                }
                DiffFormat::Patch => {
                    print!(
                        "{}",
                        diff::unified_diff(&repo, &left, &right).context("computing diff")?
                    );
                }
                DiffFormat::Json => {
                    let detail =
                        diff::diff_detail(&repo, &left, &right).context("computing diff")?;
                    println!("{}", serde_json::to_string_pretty(&detail)?);
                }
            }
        }

        Command::Comment { diff_id, format } => {
            // Surface a clear error if the diff doesn't exist.
            store::get_diff(&conn, &diff_id).context("looking up diff")?;
            let comments = store::comments_for_diff(&conn, &diff_id)?;
            match format {
                Format::Json => println!("{}", serde_json::to_string_pretty(&comments)?),
                Format::Md => print!("{}", render_markdown(&diff_id, &comments)),
            }
        }

        Command::CommentAdd {
            diff_id,
            body,
            file,
            line,
            side,
        } => {
            let comment = store::add_comment(
                &conn,
                &diff_id,
                file.as_deref(),
                line,
                side.as_deref(),
                &body,
            )
            .context("adding comment")?;
            println!("{}", comment.id);
        }
    }

    Ok(())
}

/// A `git diff --stat`-style listing of a diff's changed files.
fn render_summary(summary: &DiffSummary) -> String {
    if summary.files.is_empty() {
        return "no changes\n".to_string();
    }
    let mut out = String::new();
    for f in &summary.files {
        let letter = match f.status {
            FileStatus::Added => 'A',
            FileStatus::Modified => 'M',
            FileStatus::Deleted => 'D',
            FileStatus::Renamed => 'R',
            FileStatus::Copied => 'C',
        };
        let path = match &f.old_path {
            Some(old) => format!("{old} -> {}", f.path),
            None => f.path.clone(),
        };
        if f.binary {
            out.push_str(&format!("  {letter}  {path} (binary)\n"));
        } else {
            out.push_str(&format!(
                "  {letter}  {path}  +{} -{}\n",
                f.additions, f.deletions
            ));
        }
    }
    out.push_str(&format!(
        "{} file{} changed, +{} -{}\n",
        summary.files.len(),
        if summary.files.len() == 1 { "" } else { "s" },
        summary.total_additions,
        summary.total_deletions,
    ));
    out
}

fn render_markdown(diff_id: &str, comments: &[Comment]) -> String {
    let mut out = format!("# Comments for diff `{diff_id}`\n\n");
    if comments.is_empty() {
        out.push_str("_No comments yet._\n");
        return out;
    }
    for c in comments {
        match (&c.file_path, c.line) {
            (Some(f), Some(l)) => out.push_str(&format!("### `{f}`:{l}\n\n")),
            (Some(f), None) => out.push_str(&format!("### `{f}`\n\n")),
            _ => out.push_str("### General\n\n"),
        }
        out.push_str(&c.body);
        out.push_str("\n\n");
    }
    out
}
