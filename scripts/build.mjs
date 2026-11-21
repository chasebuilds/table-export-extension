// Bundles src/ with esbuild and copies public/ into dist/ (or dist-test/ with --test).
// The test build adds localhost host access and an empty service worker so the Playwright
// smoke test can drive the popup without a toolbar click. The release build never has them.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const test = process.argv.includes("--test");
const out = test ? "dist-test" : "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({
  entryPoints: { popup: "src/popup.ts", content: "src/content.ts" },
  outdir: out,
  bundle: true,
  format: "iife",
  target: "chrome102",
  minify: !test,
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
});
cpSync("public", out, { recursive: true });

if (test) {
  const manifest = JSON.parse(readFileSync(`${out}/manifest.json`, "utf8"));
  manifest.host_permissions = ["http://127.0.0.1/*"];
  manifest.background = { service_worker: "sw.js" };
  writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
  writeFileSync(`${out}/sw.js`, "// test build only\n");
}
