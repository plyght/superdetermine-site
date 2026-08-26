// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import sitemap from "@astrojs/sitemap";
import react from "@astrojs/react";

// https://astro.build/config
export default defineConfig({
  site: "https://superdetermine.com",
  integrations: [icon(), react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
