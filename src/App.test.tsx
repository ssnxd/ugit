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
  it("renders the ugit shell with the idle empty state", () => {
    renderApp();
    // Wordmark in the top bar + the main empty-state title both say "ugit".
    expect(screen.getAllByText("ugit").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Pick something to diff")).toBeInTheDocument();
  });

  it("disables the Diff button until a repo path is entered", () => {
    renderApp();
    expect(screen.getByRole("button", { name: "Diff" })).toBeDisabled();
  });
});
