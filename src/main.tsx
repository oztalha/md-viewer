import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initApp } from "./init";
import "katex/dist/katex.min.css";
import "./styles.css";

initApp();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
