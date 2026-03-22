import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
