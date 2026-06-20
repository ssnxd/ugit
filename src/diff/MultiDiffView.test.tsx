import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

import { MultiDiffView } from "./MultiDiffView";

const codeViewProps = vi.hoisted(() => ({
  current: null as
    | {
        className?: string;
        items?: { id: string }[];
        onScroll?: (scrollTop: number, viewer: { getTopForItem: (id: string) => number | undefined }) => void;
      }
    | null,
}));

vi.mock("@pierre/diffs", () => ({
  processPatch: () => ({
    files: [{ name: "src/second.ts" }, { name: "src/first.ts" }, { name: "src/third.ts" }],
  }),
}));

vi.mock("@pierre/diffs/react", () => ({
  CodeView: React.forwardRef<HTMLDivElement, { className?: string; items?: { id: string }[]; onScroll?: (scrollTop: number, viewer: { getTopForItem: (id: string) => number | undefined }) => void }>(function MockCodeView(props, ref) {
    codeViewProps.current = props;
    return <div ref={ref} data-testid="code-view" className={props.className} />;
  }),
  useWorkerPool: () => ({
    primeDiffHighlightCache: vi.fn(),
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

  it("reports the file nearest the top of the diff viewport while scrolling", () => {
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
});
