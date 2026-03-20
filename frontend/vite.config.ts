import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Replace 0.0.0.0 (bind address) with 127.0.0.1 (connect address) for proxy
const apiUrl = (process.env.VITE_API_URL || "http://127.0.0.1:8000").replace(
  "0.0.0.0",
  "127.0.0.1",
);
const wsUrl = apiUrl.replace(/^http/, "ws");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/ws": { target: wsUrl, ws: true, changeOrigin: true },
      "/api": { target: apiUrl, changeOrigin: true },
      "/health": { target: apiUrl, changeOrigin: true },
    },
  },
});
