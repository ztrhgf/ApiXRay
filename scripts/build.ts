import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type JsonObject = Record<string, unknown>;

const root = process.cwd();
const distRoot = path.join(root, "dist");

async function readJson(filePath: string): Promise<JsonObject> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as JsonObject;
}

function mergeJson(base: JsonObject, override: JsonObject): JsonObject {
  const merged: JsonObject = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key];
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      current &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      merged[key] = mergeJson(current as JsonObject, value as JsonObject);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

async function bundleBrowser(browser: "chrome" | "firefox"): Promise<void> {
  const outDir = path.join(distRoot, browser);
  await mkdir(path.join(outDir, "devtools"), { recursive: true });
  await mkdir(path.join(outDir, "panel"), { recursive: true });

  await build({
    entryPoints: [path.join(root, "src/devtools/devtools.ts")],
    bundle: true,
    platform: "browser",
    target: ["es2020"],
    sourcemap: false,
    outfile: path.join(outDir, "devtools/devtools.js")
  });

  await build({
    entryPoints: [path.join(root, "src/panel/panel.ts")],
    bundle: true,
    platform: "browser",
    target: ["es2020"],
    sourcemap: false,
    outfile: path.join(outDir, "panel/panel.js")
  });

  await cp(path.join(root, "src/devtools/devtools.html"), path.join(outDir, "devtools/devtools.html"));
  await cp(path.join(root, "src/panel/panel.html"), path.join(outDir, "panel/panel.html"));
  await cp(path.join(root, "src/panel/panel.css"), path.join(outDir, "panel/panel.css"));
  await cp(path.join(root, "src/icons"), path.join(outDir, "icons"), { recursive: true });

  const baseManifest = await readJson(path.join(root, "manifests/base.json"));
  const browserManifest = await readJson(path.join(root, `manifests/${browser}.json`));
  const merged = mergeJson(baseManifest, browserManifest);

  await writeFile(path.join(outDir, "manifest.json"), `${JSON.stringify(merged, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  await rm(distRoot, { recursive: true, force: true });
  await bundleBrowser("chrome");
  await bundleBrowser("firefox");
  console.log("Build complete: dist/chrome and dist/firefox");
}

void main();
