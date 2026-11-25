// Builds the demo page into _site/: the page and the extension's export code bundled as demo.js.
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

rmSync("_site", { recursive: true, force: true });
mkdirSync("_site", { recursive: true });
await build({
  entryPoints: ["demo/src/demo.ts"],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: "_site/demo.js",
  legalComments: "none",
  logLevel: "error",
});
cpSync("demo/index.html", "_site/index.html");
writeFileSync("_site/.nojekyll", "");
console.log("built _site");
