// Build the frontend-only Namecheap beta from an allowlisted public tree.
// This deliberately excludes the development-only Qwen model and preview HTML.
import { cp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "vite";

const client = fileURLToPath(new URL("../", import.meta.url));
const root = client;
const staging = resolve("E:/lalsobuj-release-1.28.1/public");
const output = resolve("E:/lalsobuj-release-1.28.1/client-dist");
await rm(staging, { recursive: true, force: true });
await rm(output, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await cp(resolve(client, "public/checker-ocr"), join(staging, "checker-ocr"), { recursive: true });
await cp(resolve(client, "public/checker-handwriting/bengali-specialist"), join(staging, "checker-handwriting/bengali-specialist"), { recursive: true });
await cp(resolve(client, "public/checker-handwriting/runtime"), join(staging, "checker-handwriting/runtime"), { recursive: true });
const entries = ["favicon.svg", "manifest.webmanifest", "robots.txt", "assets"];
for (const entry of entries) {
  const source = resolve(client, "public", entry);
  if (existsSync(source)) await cp(source, join(staging, entry), { recursive: true });
}
process.env.LSP_PUBLIC_DIR = staging;
process.env.LSP_OUT_DIR = output;
await build({ root });
console.log(`Namecheap beta frontend built at ${output}`);
