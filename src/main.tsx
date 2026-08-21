import { render } from "preact";
import "./styles.css";
import { App } from "./app";
import { ErrorBoundary } from "./ui/error-boundary";

const root = document.getElementById("root");
if (root === null) throw new Error("#root が見つかりません");
render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
  root,
);
