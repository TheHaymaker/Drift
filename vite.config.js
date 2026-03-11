import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
  },
  server: {
    proxy: {
      // Proxy API requests to the Express server
      "/api": {
        target: "http://localhost:3377",
      },
    },
  },
});
