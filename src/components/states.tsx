/** Shared loading / empty / error primitives used across the app. */
import type { CSSProperties, ReactNode } from "react";

/** A skeleton block — used in place of spinners over content. */
export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={`animate-pulse rounded-sm bg-line/60 ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

/** An empty state that teaches the interface rather than saying "nothing here". */
export function EmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      {icon && <div className="text-faint">{icon}</div>}
      <p className="text-md font-medium text-ink">{title}</p>
      {hint && <p className="max-w-[42ch] text-sm leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

/** An error state with the underlying message and an optional retry. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-md font-medium text-ink">Something went wrong</p>
      <p className="max-w-[52ch] font-mono text-sm leading-relaxed text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ease-out-quint rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:bg-raised"
        >
          Try again
        </button>
      )}
    </div>
  );
}
