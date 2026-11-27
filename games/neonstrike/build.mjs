/*
 * 檔案導讀：開發用打包指令：只在霓光突擊規則或音效真的改變時重建 browser.js。
 * 單純縮排與註解不改變程式行為，不需要重建。
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 只有規則或音效改變時才重建；玩家用的是已提交的 browser.js。
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
// 用 esbuild 把 browser-entry.js 和所有模組打包成一個 browser.js（iife 格式，一
// 般網頁直接載入就能執行）。
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
