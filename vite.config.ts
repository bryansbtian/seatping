import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
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
      "/admin/customer": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/featured-restaurants": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/businesses": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/admin/campaign-templates": {
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
      "/api/locations": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/featured-restaurants": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/restaurants": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/reservations": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/search": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/guests": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/campaigns": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/audiences": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/jobs": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/cron": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/tickets": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/api/health": {
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
