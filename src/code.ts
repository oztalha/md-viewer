import { renderBlocks } from "./markdown";
import { fenceFor } from "./json";

/** File extension -> highlighter language, for files previewed as code. */
const LANGS: Record<string, string> = {
  py: "python", pyi: "python", ipynb: "json",
  js: "javascript", mjs: "javascript", cjs: "javascript", jsx: "jsx",
  ts: "typescript", mts: "typescript", tsx: "tsx",
  sh: "bash", bash: "bash", zsh: "bash",
  rs: "rust", go: "go", java: "java", kt: "kotlin", scala: "scala",
  rb: "ruby", php: "php", swift: "swift", c: "c", h: "c", cpp: "cpp", hpp: "cpp", cs: "csharp",
  sql: "sql", yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini",
  xml: "xml", html: "html", css: "css", scss: "scss",
  lua: "lua", r: "r", pl: "perl", dockerfile: "docker", tf: "hcl", proto: "proto",
};

/** Highlighter language for a code file, or null if it isn't one. */
export function codeLanguage(path: string | null): string | null {
  if (!path) return null;
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  if (name === "dockerfile") return "docker";
  if (name === "makefile") return "make";
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return LANGS[ext] ?? null;
}

/**
 * Preview for a code file: the whole file as one highlighted code block,
 * reusing the markdown pipeline (same as a fenced ```python block).
 */
export function renderCodeBlocks(source: string, lang: string): string[] {
  const fence = fenceFor(source);
  return renderBlocks(`${fence}${lang}\n${source.replace(/\n$/, "")}\n${fence}\n`);
}
