import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // LIM Explorer is a static build in public/lim; serve its entry page at /lim.
  async rewrites() {
    return [{ source: "/lim", destination: "/lim/index.html" }];
  },
  /* config options here */
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
