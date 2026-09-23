import { mkdir, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const client = fileURLToPath(new URL("../", import.meta.url));
const destination = path.join(client, "public/checker-ocr");
await mkdir(destination, { recursive: true });
await copyFile(path.join(client, "node_modules/tesseract.js/dist/worker.min.js"), path.join(destination, "worker.min.js"));
const core = path.join(client, "node_modules/tesseract.js-core");
for (const name of await readdir(core)) {
  if (/\.wasm(?:\.js)?$/.test(name) || name === "LICENSE") await copyFile(path.join(core, name), path.join(destination, name));
}
for (const lang of ["eng", "ben"]) await copyFile(path.join(client, `node_modules/@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), path.join(destination, `${lang}.traineddata.gz`));
console.log("Prepared self-hosted English/Bengali OCR assets; documents are not sent to an OCR service.");
