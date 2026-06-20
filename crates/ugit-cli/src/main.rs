//! `ugit` — the command-line surface.
//!
//! Every subcommand opens the shared store via `ugit_core::store::open()` and
//! delegates to `ugit-core`. There is no ugit logic here that the desktop GUI
//! doesn't also go through — the CLI is deliberately a thin shell so the two
//! surfaces stay in lockstep over the same database.

use anyhow::{Context, Result};
use clap::{Parser, Subcommand, ValueEnum};

use ugit_core::model::DiffKind;
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

fn main() -> Result<()> {
    let cli = Cli::parse();
    let conn = store::open().context("opening the ugit store")?;

    match cli.command {
        Command::Diff {
            left,
            right,
            repo,
            kind,
        } => {
            let diff = diff::compute_diff(&conn, &repo, &left, &right, kind.into())
                .context("computing diff")?;
            println!("{}", diff.id);
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
