import { defineConfig, loadEnv } from "vite";

const rewriteRootToCirkitInDev = {
  name: "rewrite-root-to-cirkit-in-dev",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/cirkit") {
        res.statusCode = 302;
        res.setHeader("Location", "/cirkit/");
        res.end();
        return;
      }
      if (req.url === "/" || req.url === "") {
        req.url = "/cirkit/";
      } else if (req.url && req.url.startsWith("/cirkit/")) {
        req.url = req.url.slice("/cirkit".length) || "/";
      }
      next();
    });
  },
};

export default defineConfig(({ command }) => {
  const env = loadEnv("", process.cwd(), "");
  const useCirkitBase =
    command === "build" || process.env.CIRKIT_BASE === "/cirkit/";
  const clientPort = Number(env.CLIENT_PORT || env.VITE_CLIENT_PORT || "5173");
  const previewPort = Number(env.PREVIEW_PORT || env.VITE_PREVIEW_PORT || "4173");
  const serverPort = Number(env.VITE_SERVER_PORT || env.PORT || "4000");
  const proxyTarget = `http://localhost:${Number.isFinite(serverPort) ? serverPort : 4000}`;
  const proxy = {
    "/api": {
      target: proxyTarget,
      changeOrigin: true,
    },
    "/cirkit/api": {
      target: proxyTarget,
      changeOrigin: true,
      rewrite: (path: string) => path.replace(new RegExp("^/cirkit"), ""),
    },
  };
  const allowedHosts = ["localhost", "127.0.0.1", "benchen.io", "www.benchen.io"];

  return {
    base: useCirkitBase ? "/cirkit/" : "/",
    plugins: command === "serve" && useCirkitBase ? [rewriteRootToCirkitInDev] : [],
    server: {
      allowedHosts,
      host: true,
      strictPort: true,
      port: Number.isFinite(clientPort) ? clientPort : 5173,
      proxy,
    },
    preview: {
      host: true,
      strictPort: true,
      port: Number.isFinite(previewPort) ? previewPort : 4173,
      allowedHosts,
      proxy,
    },
  };
});
