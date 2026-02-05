import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import tailwind from "@astrojs/tailwind";
import vercel from "@astrojs/vercel/serverless";

export default defineConfig({
  site: "https://ashxyz.com",
  output: "hybrid",
  adapter: vercel(),
  integrations: [mdx(), sitemap(), tailwind()],
  devToolbar: {
    enabled: false
  }
});
