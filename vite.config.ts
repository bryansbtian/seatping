import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/auth": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/update-credits": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/stripe": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/feedback": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/sales": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/tickets": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
