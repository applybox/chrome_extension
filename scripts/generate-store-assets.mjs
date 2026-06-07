import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const screenshotsDir = join(root, "store", "screenshots");
const iconsDir = join(root, "icons");
const sourceIcon = join(iconsDir, "icon.png");

mkdirSync(screenshotsDir, { recursive: true });

function runSips(args) {
  execSync(`sips ${args.join(" ")}`, { stdio: "inherit" });
}

// 1) Exact 128×128 store icon (pad to square, black background matches logo)
const icon128Store = join(screenshotsDir, "icon-128x128.png");
const icon128Manifest = join(iconsDir, "icon128.png");
const tempIcon = join(screenshotsDir, ".icon-temp.png");

runSips(["-Z", "120", sourceIcon, "--out", tempIcon]);
runSips(["--padToHeightWidth", "128", "128", "--padColor", "000000", tempIcon, "--out", icon128Store]);
runSips(["-c", "128", "128", icon128Store, "--out", icon128Manifest]);

copyFileSync(icon128Store, join(screenshotsDir, "icon128.png"));

console.log(`Created ${icon128Store}`);
console.log(`Created ${join(screenshotsDir, "icon128.png")}`);
console.log(`Updated ${icon128Manifest}`);

// 2) 1280×800 store screenshots via Playwright + Sharp
let playwright;
let sharp;
try {
  playwright = await import("playwright");
  sharp = (await import("sharp")).default;
} catch {
  console.error(
    "Install dev dependencies first: npm install --save-dev playwright sharp\nThen run: npx playwright install chromium"
  );
  process.exit(1);
}

const previews = [
  { file: "login.html", output: "screenshot-01-login-1280x800.png" },
  { file: "candidate.html", output: "screenshot-02-candidate-1280x800.png" },
];

const chromePaths = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];

let executablePath;
for (const candidate of chromePaths) {
  if (existsSync(candidate)) {
    executablePath = candidate;
    break;
  }
}

const browser = await playwright.chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});
const page = await browser.newPage();

for (const preview of previews) {
  const previewPath = join(root, "store", "preview", preview.file);
  const panelPath = join(screenshotsDir, `.panel-${preview.file}.png`);
  const outputPath = join(screenshotsDir, preview.output);

  await page.setViewportSize({ width: 400, height: preview.file === "login.html" ? 640 : 720 });
  await page.goto(`file://${previewPath}`);
  await page.screenshot({ path: panelPath, fullPage: true });

  const panelMeta = await sharp(panelPath).metadata();
  const panelWidth = panelMeta.width ?? 400;
  const panelHeight = panelMeta.height ?? 640;

  const maxPanelHeight = 720;
  const scale = Math.min(520 / panelWidth, maxPanelHeight / panelHeight, 1);
  const scaledWidth = Math.round(panelWidth * scale);
  const scaledHeight = Math.round(panelHeight * scale);

  const resizedPanel = await sharp(panelPath)
    .resize(scaledWidth, scaledHeight, { fit: "inside" })
    .png()
    .toBuffer();

  const left = Math.round((1280 - scaledWidth) / 2);
  const top = Math.round((800 - scaledHeight) / 2);

  await sharp({
    create: {
      width: 1280,
      height: 800,
      channels: 3,
      background: { r: 241, g: 245, b: 249 },
    },
  })
    .composite([
      {
        input: resizedPanel,
        left,
        top,
      },
    ])
    .png()
    .toFile(outputPath);

  console.log(`Created ${outputPath}`);
}

await browser.close();

// Clean temp files
for (const preview of previews) {
  const panelPath = join(screenshotsDir, `.panel-${preview.file}.png`);
  if (existsSync(panelPath)) {
    execSync(`rm "${panelPath}"`);
  }
}
if (existsSync(tempIcon)) {
  execSync(`rm "${tempIcon}"`);
}

console.log("\nStore assets ready in chrome-extension/store/screenshots/");
