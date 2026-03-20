import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiUrl = process.env.VITE_API_URL || "http://127.0.0.1:8000";
const wsUrl = apiUrl.replace(/^http/, "ws");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/ws": { target: wsUrl, ws: true },
      "/api": { target: apiUrl },
      "/health": { target: apiUrl },
    },
  },
});
