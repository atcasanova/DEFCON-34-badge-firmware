import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "/DEFCON-34-badge-firmware/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
