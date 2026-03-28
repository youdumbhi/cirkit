import { defineConfig } from "vite";

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
  const useCirkitBase =
    command === "build" || process.env.CIRKIT_BASE === "/cirkit/";

  return {
    base: useCirkitBase ? "/cirkit/" : "/",
    plugins: command === "serve" && useCirkitBase ? [rewriteRootToCirkitInDev] : [],
    server: {
      allowedHosts: ["benchen.io", "www.benchen.io"],
      host: true,
      strictPort: true,
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
        },
        "/cirkit/api": {
          target: "http://localhost:4000",
          changeOrigin: true,
          rewrite: (path) => path.replace(new RegExp("^/cirkit"), ""),
        },
      },
    },
  };
});
