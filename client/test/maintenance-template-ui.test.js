import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Module } from "node:module";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server.js";
import { TEMPLATE_STORAGE_KEY, DEFAULT_ILLUSTRATED_PARTS, upgradeIllustratedTemplate } from "../src/components/maintenance3d/illustrationModel.js";

const root = fileURLToPath(new URL("..", import.meta.url));
// Compile the actual UI in memory. Asset paths are retained, no image conversion
// or browser/session access is involved, and no production database is loaded.
const output = await build({
  absWorkingDir: root,
  entryPoints: ["src/components/maintenance3d/Maintenance3DPreview.jsx"],
  bundle: true, write: false, platform: "node", format: "cjs", packages: "external", jsx: "automatic",
  define: { __APP_VERSION__: '"test-preview"', __APP_REVISION__: '"test"' },
  loader: { ".css": "empty", ".obj": "text" },
  plugins: [{ name: "asset-paths", setup(builder) {
    builder.onLoad({ filter: /\.png$/ }, (asset) => ({ contents: `export default ${JSON.stringify(asset.path)}`, loader: "js" }));
  } }],
});
const compiled = new Module(path.join(root, "test/virtual-preview.cjs"));
compiled.paths = Module._nodeModulePaths(root);
compiled._compile(output.outputFiles[0].text, compiled.id);
const Preview = compiled.exports.default;
const render = (props) => renderToStaticMarkup(createElement(StaticRouter, { location: "/settings" }, createElement(Preview, { initialMode: "illustration", ...props })));

test("engine type controls exist in Settings only; new part editors are available", () => {
  const settings = render({ editor: true, canEdit: true });
  assert.match(settings, /role="group" aria-label="Engine type"/);
  for (const type of ["Front engine", "Rear engine", "Double engine"]) assert.ok(settings.includes(type));
  for (const part of ["Front glass", "Side glass", "Wiper", "Interior seat", "Side mirror"]) assert.ok(settings.includes(part));
  assert.ok(settings.includes("Save template"));
  const maintenance = render({ editor: false });
  assert.doesNotMatch(maintenance, /role="group" aria-label="Engine type"/);
  assert.match(maintenance, /Engine type is managed in Settings/);
});

test("Maintenance reads saved front/double artwork; it never renders type-changing controls", () => {
  const previous = globalThis.localStorage;
  try {
    for (const [engineLayout, image] of [["front", "bus-front-engine.png"], ["double", "bus-double-engine.png"]]) {
      const template = { ...upgradeIllustratedTemplate(DEFAULT_ILLUSTRATED_PARTS), engineLayout };
      globalThis.localStorage = { getItem: (key) => key === TEMPLATE_STORAGE_KEY ? JSON.stringify(template) : null };
      const markup = render({ editor: false });
      assert.ok(markup.includes(image));
      assert.doesNotMatch(markup, /role="group" aria-label="Engine type"/);
    }
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Settings disables type selection when the viewer cannot edit", () => {
  const markup = render({ editor: true, canEdit: false });
  const choices = markup.match(/<div class="bus-engine-layout-options"[\s\S]*?<\/div>/)?.[0];
  assert.ok(choices);
  assert.equal((choices.match(/disabled=""/g) || []).length, 3);
  assert.ok(!markup.includes("Save template"));
});
