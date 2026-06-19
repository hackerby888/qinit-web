import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://127.0.0.1:8787" }, // dev: forward API to the backend (127.0.0.1, not localhost -> avoids IPv6 ::1 miss)
  },
});
