import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

const apiTarget = process.env.API_PROXY_TARGET || "http://localhost:4000";

export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/auth": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/admin/update-credits": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/admin/customer": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/admin/featured-restaurants": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/admin/businesses": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/admin/campaign-templates": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/feedback": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/sales": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/locations": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/featured-restaurants": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/restaurants": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/reservations": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/floor": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/search": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/guests": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/campaigns": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/audiences": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/jobs": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/cron": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/tickets": {
        target: apiTarget,
        changeOrigin: true,
      },
      "/api/health": {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));
