/**
 * Hosts the `@pierre/diffs` Shiki worker pool and keeps its theme in lockstep
 * with ugit's theme store. The diff renderer (and the rest of the app) therefore
 * always reflect the user's chosen Shiki theme + light/dark mode.
 */
import { useEffect, useState, type ReactNode } from "react";
import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
// Vite bundles the package's ESM worker; `?worker` yields a Worker constructor.
import DiffWorker from "@pierre/diffs/worker/worker.js?worker";

import { useTheme } from "../theme/theme";
import { SHIKI_THEMES } from "./themes";

function workerFactory(): Worker {
  return new DiffWorker();
}

/** Push the active theme into the worker pool whenever it changes. */
function ThemeSync() {
  const pool = useWorkerPool();
  const { shikiTheme, resolved } = useTheme();

  useEffect(() => {
    pool?.setRenderOptions({ theme: SHIKI_THEMES[shikiTheme][resolved] });
  }, [pool, shikiTheme, resolved]);

  return null;
}

/**
 * Whether the Shiki worker pool has finished initializing. The diff renderer
 * produces nothing if it mounts before the pool is ready (and doesn't retry), so
 * the diff view waits on this before mounting.
 */
export function useWorkerReady(): boolean {
  const pool = useWorkerPool();
  const [ready, setReady] = useState(() => pool?.isInitialized() ?? false);

  useEffect(() => {
    if (!pool) return;
    if (pool.isInitialized()) {
      setReady(true);
      return;
    }
    setReady(false);
    return pool.subscribeToStatChanges((stats) => {
      if (stats.managerState === "initialized") setReady(true);
    });
  }, [pool]);

  return ready;
}

export function DiffWorkerProvider({ children }: { children: ReactNode }) {
  const { shikiTheme, resolved } = useTheme();
  const initialTheme = SHIKI_THEMES[shikiTheme][resolved];

  return (
    <WorkerPoolContextProvider
      poolOptions={{ workerFactory }}
      highlighterOptions={{ theme: initialTheme }}
    >
      <ThemeSync />
      {children}
    </WorkerPoolContextProvider>
  );
}
