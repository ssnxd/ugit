/** The comments side panel for the active diff. Compose general or file-scoped
 *  comments, edit, and delete. These persist to the shared store and are exactly
 *  what `ugit comment <diff-id>` exports for an agent. Inline line-anchored
 *  comments land in Cut 2. */
import { useState } from "react";

import type { Comment } from "../lib/types";

function relativeTime(epochSeconds: number): string {
  const diff = Date.now() / 1000 - epochSeconds;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function anchorLabel(c: Comment): string {
  if (!c.filePath) return "General";
  return c.line != null ? `${basename(c.filePath)}:${c.line}` : basename(c.filePath);
}

export function CommentsPanel({
  comments,
  selectedFile,
  onAdd,
  onEdit,
  onDelete,
  onClose,
}: {
  comments: Comment[];
  selectedFile: string | null;
  onAdd: (body: string, filePath: string | null) => void;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [attach, setAttach] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const canAttach = selectedFile != null;

  function submit() {
    const body = draft.trim();
    if (!body) return;
    onAdd(body, attach && canAttach ? selectedFile : null);
    setDraft("");
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
        <span className="text-sm font-medium text-ink">Comments</span>
        <span className="font-mono text-xs text-faint">{comments.length}</span>
        <button
          type="button"
          onClick={onClose}
          title="Close comments"
          className="ease-out-quint ml-auto rounded-md px-1.5 py-0.5 text-sm text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {comments.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted">
            No comments yet. Add one below — it’ll be exported by{" "}
            <span className="font-mono text-xs">ugit comment</span>.
          </p>
        ) : (
          <ul className="flex flex-col">
            {comments.map((c) => (
              <li key={c.id} className="border-b border-line px-3 py-2">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-accent">
                    {anchorLabel(c)}
                  </span>
                  <span className="shrink-0 text-[10px] text-faint">
                    {relativeTime(c.createdAt)}
                  </span>
                </div>
                {editingId === c.id ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <textarea
                      autoFocus
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.currentTarget.value)}
                      rows={3}
                      className="resize-none rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus:border-line-strong focus:outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          if (editDraft.trim()) onEdit(c.id, editDraft.trim());
                          setEditingId(null);
                        }}
                        className="ease-out-quint rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-accent-ink hover:opacity-90"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="ease-out-quint rounded-md px-2 py-0.5 text-xs text-muted hover:text-ink"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-ink">
                      {c.body}
                    </p>
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.body);
                        }}
                        className="text-[10px] text-faint transition-colors hover:text-ink"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="text-[10px] text-faint transition-colors hover:text-[var(--ug-diff-del-line)]"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Add a comment…  (⌘↵ to send)"
          className="w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-ink placeholder:text-faint focus:border-line-strong focus:outline-none"
        />
        <div className="mt-1.5 flex items-center justify-between">
          <label
            className={`flex items-center gap-1.5 text-xs ${canAttach ? "text-muted" : "text-faint"}`}
          >
            <input
              type="checkbox"
              checked={attach && canAttach}
              disabled={!canAttach}
              onChange={(e) => setAttach(e.currentTarget.checked)}
            />
            {canAttach ? `On ${basename(selectedFile)}` : "General"}
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            className="ease-out-quint rounded-md bg-accent px-3 py-1 text-xs font-medium text-accent-ink transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Comment
          </button>
        </div>
      </div>
    </aside>
  );
}
