import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // End-to-end runs use their own build directory so they never clash with `next dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Self-contained server bundle for the production container (see Dockerfile).
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
