import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/* Absolute URLs for canonical/OG tags. Vercel exposes the production domain at
   build time; SITE_URL overrides it once a custom domain is attached. Relative
   og:image paths are ignored by most scrapers, so this can't just be "/og.png". */
const siteUrl = (
  process.env.SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  "http://localhost:5173"
).replace(/\/$/, "");

export default defineConfig({
  plugins: [
    react(),
    {
      name: "site-url",
      /* "pre" matters: vite:build-html runs decodeURI over href/src, and a bare
         %SITE_URL% is an invalid percent-escape, so it must be gone by then. */
      transformIndexHtml: {
        order: "pre",
        handler: (html) => html.replaceAll("%SITE_URL%", siteUrl),
      },
    },
  ],
  build: { outDir: "dist" },
});
