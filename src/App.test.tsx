import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";
import { ThemeProvider } from "./theme/theme";

function renderApp() {
  return render(
    <ThemeProvider>
      <App />
    </ThemeProvider>,
  );
}

describe("App", () => {
  it("opens to the repository start screen", () => {
    renderApp();
    // Wordmark in the top bar + the start-screen heading both say "ugit".
    expect(screen.getAllByText("ugit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Open a repository to start diffing.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open folder…" })).toBeInTheDocument();
  });

  it("does not show the Diff action before a repo is open", () => {
    renderApp();
    expect(screen.queryByRole("button", { name: "Diff" })).not.toBeInTheDocument();
  });
});
