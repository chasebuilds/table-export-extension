import AdmZip from "adm-zip";
import { readFileSync } from "node:fs";

const version = JSON.parse(readFileSync("dist/manifest.json", "utf8")).version;
const name = `table-export-extension-v${version}.zip`;
const zip = new AdmZip();
zip.addLocalFolder("dist");
zip.writeZip(name);
console.log(`wrote ${name}`);
