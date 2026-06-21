import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiDiffView } from "./MultiDiffView";

const codeViewProps = vi.hoisted(() => ({
  current: null as {
    className?: string;
    items?: { id: string }[];
    onScroll?: (
      scrollTop: number,
      viewer: { getTopForItem: (id: string) => number | undefined },
    ) => void;
  } | null,
}));

const mocks = vi.hoisted(() => ({
  processPatch: vi.fn((_patch: string, _cacheKeyPrefix?: string) => ({
    files: [{ name: "src/second.ts" }, { name: "src/first.ts" }, { name: "src/third.ts" }],
  })),
  primeDiffHighlightCache: vi.fn(),
}));

vi.mock("@pierre/diffs", () => ({
  processPatch: mocks.processPatch,
}));

vi.mock("@pierre/diffs/react", () => ({
  CodeView: React.forwardRef<
    HTMLDivElement,
    {
      className?: string;
      items?: { id: string }[];
      onScroll?: (
        scrollTop: number,
        viewer: { getTopForItem: (id: string) => number | undefined },
      ) => void;
    }
  >(function MockCodeView(props, ref) {
    codeViewProps.current = props;
    return <div ref={ref} data-testid="code-view" className={props.className} />;
  }),
  useWorkerPool: () => ({
    primeDiffHighlightCache: mocks.primeDiffHighlightCache,
  }),
}));

vi.mock("./DiffWorkerProvider", () => ({
  useWorkerReady: () => true,
}));

describe("MultiDiffView", () => {
  it("renders the diff renderer as the scroll container", () => {
    render(
      <MultiDiffView
        patch="diff --git a/src/example.ts b/src/example.ts"
        diffStyle="split"
        scrollToPath={null}
        scrollToKey={0}
        orderedPaths={["src/first.ts", "src/second.ts", "src/third.ts"]}
        comments={[]}
        onActivePathChange={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("code-view")).toHaveClass(
      "ugit-diff",
      "min-h-0",
      "flex-1",
      "overflow-auto",
    );
  });

  it("reports the file nearest the top of the diff viewport while scrolling", async () => {
    const onActivePathChange = vi.fn();
    render(
      <MultiDiffView
        patch="diff --git a/src/example.ts b/src/example.ts"
        diffStyle="split"
        scrollToPath={null}
        scrollToKey={0}
        orderedPaths={["src/first.ts", "src/second.ts", "src/third.ts"]}
        comments={[]}
        onActivePathChange={onActivePathChange}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    codeViewProps.current?.onScroll?.(220, {
      getTopForItem: (id) =>
        ({
          "src/first.ts": 8,
          "src/second.ts": 180,
          "src/third.ts": 360,
        })[id],
    });

    // The scroll-spy is coalesced to one pass per animation frame.
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(onActivePathChange).toHaveBeenCalledWith("src/second.ts");
  });

  it("renders files in the same order as the file tree", () => {
    render(
      <MultiDiffView
        patch="diff --git a/src/example.ts b/src/example.ts"
        diffStyle="split"
        scrollToPath={null}
        scrollToKey={0}
        orderedPaths={["src/first.ts", "src/second.ts", "src/third.ts"]}
        comments={[]}
        onActivePathChange={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(codeViewProps.current?.items?.map((item) => item.id)).toEqual([
      "src/first.ts",
      "src/second.ts",
      "src/third.ts",
    ]);
  });

  it("parses with a cache-key prefix and primes every file, so highlighting is cached (no plain-text flash)", () => {
    mocks.processPatch.mockClear();
    mocks.primeDiffHighlightCache.mockClear();

    render(
      <MultiDiffView
        patch="diff --git a/src/example.ts b/src/example.ts"
        diffStyle="split"
        scrollToPath={null}
        scrollToKey={0}
        orderedPaths={["src/first.ts", "src/second.ts", "src/third.ts"]}
        comments={[]}
        onActivePathChange={vi.fn()}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    // Without a non-empty prefix, processPatch leaves cacheKey undefined, which
    // disables priming + result caching (the flash). Guard that it's passed.
    const prefix = mocks.processPatch.mock.calls[0]?.[1];
    expect(typeof prefix).toBe("string");
    expect(prefix).toBeTruthy();

    expect(mocks.primeDiffHighlightCache).toHaveBeenCalledTimes(3);
  });
});
