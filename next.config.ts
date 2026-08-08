import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // tesseract.js resolves its Node worker script at runtime with a dynamic
  // require; bundling it (Turbopack/webpack) breaks that path resolution.
  serverExternalPackages: ["tesseract.js"],
  // Pin the workspace root explicitly — the project lives under a directory
  // with spaces/no lockfile above it, which otherwise makes Turbopack guess wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
