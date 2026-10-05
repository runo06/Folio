import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      usePolling: process.env.VITE_USAR_POLLING === "true",
    },
    // Proxy: el navegador solo habla con localhost:5173. Cuando pide algo
    // que empieza con /api, Vite lo reenvía al backend. Para el navegador
    // todo viene del mismo origen, así que no hay problemas de CORS y la
    // cookie de sesión funciona sin configuración extra.
    proxy: {
      "/api": {
        target: process.env.VITE_API_DESTINO ?? "http://localhost:8000",
      },
    },
  },
});
