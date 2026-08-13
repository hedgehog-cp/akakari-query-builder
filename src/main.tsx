import { render } from "preact";
import { App } from "./app";

const root = document.getElementById("root");
if (root === null) throw new Error("#root が見つかりません");
render(<App />, root);
