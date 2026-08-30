import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const clientDirectory = fileURLToPath(new URL(".", import.meta.url));
const packageInfo = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

function getBuildRevision() {
  const renderRevision = process.env.RENDER_GIT_COMMIT?.trim();
  if (renderRevision) return renderRevision.slice(0, 7);
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: clientDirectory }).toString().trim();
  } catch {
    return "local";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(packageInfo.version),
    __APP_REVISION__: JSON.stringify(getBuildRevision()),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
});
