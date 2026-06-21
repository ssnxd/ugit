/**
 * Hosts the `@pierre/diffs` Shiki worker pool, keeps its theme in lockstep with
 * the theme store, and repaints the `--ug-*` chrome tokens from the chosen
 * theme's resolved colors — so chrome, file tree, and diff all follow one theme.
 *
 * Worker readiness is tracked once here and exposed via context: the diff
 * renderer produces nothing if it mounts before the pool is ready (no retry).
 */
import { createContext, use, useEffect, useState, type ReactNode } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import { getResolvedThemes, resolveThemes } from "@pierre/diffs";
// Vite bundles the package's ESM worker; `?worker` yields a Worker constructor.
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";

import { useTheme } from "../theme/theme";

function workerFactory(): Worker {
  return new DiffWorker();
}

const WorkerReadyContext = createContext(false);

/** Whether the Shiki worker pool has finished initializing. */
export function useWorkerReady(): boolean {
  return use(WorkerReadyContext);
}

/** Paint the `--ug-bg/ink/accent` primitives from a resolved Shiki theme; the
 *  rest of the chrome derives from these via color-mix (styles.css). */
function applyChromeFromTheme(bg: string, fg: string, colors: Record<string, string>) {
  const root = document.documentElement.style;
  root.setProperty("--ug-bg", bg);
  root.setProperty("--ug-ink", fg);
  const accent =
    colors["focusBorder"] ||
    colors["textLink.foreground"] ||
    colors["button.background"] ||
    colors["terminal.ansiBlue"];
  if (accent) root.setProperty("--ug-accent", accent);
  else root.removeProperty("--ug-accent"); // fall back to the mode token
}

function PoolBridge({ children }: { children: ReactNode }) {
  const pool = useWorkerPool();
  const { shikiTheme } = useTheme();
  const [ready, setReady] = useState(() => pool?.isInitialized() ?? false);

  useEffect(() => {
    pool?.setRenderOptions({ theme: shikiTheme });
  }, [pool, shikiTheme]);

  useEffect(() => {
    if (!pool) return;
    if (pool.isInitialized()) {
      setReady(true);
      return;
    }
    return pool.subscribeToStatChanges((stats) => {
      if (stats.managerState === "initialized") setReady(true);
    });
  }, [pool]);

  // Repaint chrome from the resolved theme once it's available.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      try {
        await resolveThemes([shikiTheme]);
        if (cancelled) return;
        const [t] = getResolvedThemes([shikiTheme]);
        if (t) applyChromeFromTheme(t.bg, t.fg, t.colors ?? {});
      } catch {
        /* keep the class-based fallback tokens */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shikiTheme, ready]);

  return <WorkerReadyContext value={ready}>{children}</WorkerReadyContext>;
}

export function DiffWorkerProvider({ children }: { children: ReactNode }) {
  const { shikiTheme } = useTheme();

  return (
    <WorkerPoolContextProvider
      // Default LRU is 100; raise it so every file in a large changeset stays
      // highlighted once primed and navigating back to it is instant.
      poolOptions={{ workerFactory, totalASTLRUCacheSize: 600 }}
      highlighterOptions={{ theme: shikiTheme }}
    >
      <PoolBridge>{children}</PoolBridge>
    </WorkerPoolContextProvider>
  );
}
