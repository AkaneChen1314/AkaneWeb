/*
 * 檔案導讀：開發用打包指令：只在霓光突擊規則或音效真的改變時重建 browser.js。
 * 單純縮排與註解不改變程式行為，不需要重建。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Rebuild only when game source or audio changes. Players use the committed browser.js.
const binary = process.argv[2] || "esbuild";
const version = spawnSync(binary, ["--version"], { encoding: "utf8" });
if (
  version.error ||
  version.status !== 0 ||
  version.stdout.trim() !== "0.28.2"
) {
  throw new Error(
    "Build requires esbuild 0.28.2. Pass its executable path as the first argument.",
  );
}
const result = spawnSync(
  binary,
  [
    "browser-entry.js",
    "--bundle",
    "--format=iife",
    "--platform=browser",
    "--target=es2020",
    "--minify",
    "--legal-comments=inline",
    "--loader:.wav=dataurl",
    "--loader:.mp3=dataurl",
    "--loader:.ogg=dataurl",
    "--outfile=browser.js",
  ],
  { cwd: fileURLToPath(new URL(".", import.meta.url)), stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
