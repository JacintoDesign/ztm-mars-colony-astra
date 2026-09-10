import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: "index.html", models: "model-preview.html" },
      output: { manualChunks: { three: ["three"] } },
    },
  },
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    port: 5173,
    host: true,
  },
});
