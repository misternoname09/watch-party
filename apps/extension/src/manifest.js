import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: "Watch Party - Netflix Sync",
  description: "Synchronize Netflix playback with your friends.",
  version: "1.0.0",
  action: {
    default_popup: "popup.html",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["*://*.netflix.com/*"],
      js: ["src/content.ts"],
    },
  ],
  permissions: [
    "activeTab",
    "storage",
    "scripting"
  ],
});
