import React from "react";
import ReactDOM from "react-dom/client";

import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./styles.css";

import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DiffWorkerProvider } from "./diff/DiffWorkerProvider";
import { ThemeProvider } from "./theme/theme";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <DiffWorkerProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </DiffWorkerProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
