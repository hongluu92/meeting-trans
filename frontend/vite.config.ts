import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiPort = process.env.VITE_API_PORT || "8000";
const apiTarget = `http://localhost:${apiPort}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/ws": { target: `ws://localhost:${apiPort}`, ws: true },
      "/api": { target: apiTarget },
      "/health": { target: apiTarget },
    },
  },
});
