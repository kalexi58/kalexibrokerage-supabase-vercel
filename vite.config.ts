import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const packageMetadata: unknown = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);
if (
  typeof packageMetadata !== "object" ||
  packageMetadata === null ||
  !("version" in packageMetadata) ||
  typeof packageMetadata.version !== "string"
) {
  throw new Error("package.json must define the application version.");
}

// Nitro auto-selects the right deployment preset: "vercel" when built on Vercel,
// "node-server" locally. Override with NITRO_PRESET if you ever need to.
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(packageMetadata.version) },
  server: { port: 3000 },
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-query"] },
  plugins: [
    tsconfigPaths(),
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    tanstackStart({ server: { entry: "server" } }),
    nitro(),
    viteReact(),
    tailwindcss(),
  ],
});
