import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = pkg.version;
const distDir = join(root, "dist");
const releasesDir = join(root, "releases");
const zipPath = join(releasesDir, `applybox-recruiter-${version}.zip`);

if (!existsSync(join(distDir, "manifest.json"))) {
  console.error("dist/manifest.json not found. Run npm run build:store first.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(distDir, "manifest.json"), "utf8"));
if (manifest.host_permissions?.some((host) => host.includes("localhost"))) {
  console.error(
    "Store package must not include localhost host permissions. Run npm run build:store (not npm run build)."
  );
  process.exit(1);
}

mkdirSync(releasesDir, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

execSync(`cd "${distDir}" && zip -r -X "${zipPath}" .`, { stdio: "inherit" });

console.log(`\nStore package ready: ${zipPath}`);
console.log("Upload this ZIP to the Chrome Web Store Developer Dashboard.");
