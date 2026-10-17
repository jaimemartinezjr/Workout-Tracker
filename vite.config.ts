import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getReplitAllowedHosts(): string[] {
  const hosts = [
    process.env.REPLIT_DEV_DOMAIN,
    ...(process.env.REPLIT_DOMAINS?.split(",") ?? []),
  ];

  return [...new Set(hosts.map((host) => host?.trim()).filter((host): host is string => Boolean(host)))];
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5000,
    strictPort: true,
    allowedHosts: getReplitAllowedHosts(),
    proxy: {
      "/api": "http://localhost:3000",
    },
  },
});
