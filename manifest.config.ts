import { defineManifest } from "@crxjs/vite-plugin";
import packageJson from "./package.json";

/** Store builds set VITE_STORE_BUILD=true — omits localhost host permissions. */
const isStoreBuild = process.env.VITE_STORE_BUILD === "true";

const productionHostPermissions = [
  "https://www.linkedin.com/*",
  "https://media.licdn.com/*",
  "https://www.cv-library.co.uk/*",
  "https://photo.cvlibrary.co.uk/*",
  "https://*.cvlibrary.co.uk/*",
  "https://uk.indeed.com/*",
  "https://*.indeed.com/*",
  "https://*.indeed.co.uk/*",
  "https://*.vincere.io/*",
  "https://*.vincere.cloud/*",
  "https://*.edun.ai/*",
  "https://*.helloedun.co.uk/*",
  "https://api.applybox.co.uk/*",
  "https://app.applybox.co.uk/*",
];

const localDevHostPermissions = [
  "http://localhost:8000/*",
  "http://localhost:3000/*",
];

export default defineManifest({
  manifest_version: 3,
  name: "Applybox Recruiter",
  version: packageJson.version,
  description:
    "Import candidates from job boards and CRMs into Applybox.",
  homepage_url: "https://app.applybox.co.uk",
  minimum_chrome_version: "114",
  permissions: [
    "activeTab",
    "storage",
    "scripting",
    "tabs",
    "cookies",
    "debugger",
    "sidePanel",
    "downloads",
  ],
  host_permissions: [
    ...productionHostPermissions,
    ...(isStoreBuild ? [] : localDevHostPermissions),
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_title: "Open Applybox Recruiter",
    default_icon: {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
    },
  },
  side_panel: {
    default_path: "src/popup/index.html",
  },
  content_scripts: [
    {
      matches: ["https://www.linkedin.com/in/*"],
      js: ["content-scripts/url-monitor.js", "content-scripts/linkedin.js"],
      run_at: "document_idle",
    },
    {
      matches: ["https://www.cv-library.co.uk/*"],
      js: ["content-scripts/url-monitor.js", "content-scripts/cvlibrary.js"],
      run_at: "document_idle",
    },
    {
      matches: [
        "https://*.indeed.com/*",
        "https://*.indeed.co.uk/*",
      ],
      js: ["content-scripts/url-monitor.js", "content-scripts/indeed.js"],
      run_at: "document_idle",
    },
    {
      matches: ["https://*.vincere.io/*", "https://*.vincere.cloud/*"],
      js: ["content-scripts/url-monitor.js", "content-scripts/vincere.js"],
      run_at: "document_idle",
    },
    {
      matches: ["https://*.edun.ai/*", "https://*.helloedun.co.uk/*"],
      js: ["content-scripts/url-monitor.js", "content-scripts/edun.js"],
      run_at: "document_idle",
    },
  ],
  icons: {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png",
  },
});
