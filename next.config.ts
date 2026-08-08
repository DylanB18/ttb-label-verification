import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // tesseract.js resolves its Node worker script at runtime with a dynamic
  // require; bundling it (Turbopack/webpack) breaks that path resolution.
  serverExternalPackages: ["tesseract.js"],
  // Vercel's serverless build tracer can't statically see tesseract.js's
  // dynamic requires (its Node worker script, and tesseract.js-core's WASM
  // binary), so it drops them from the deployed function unless told to
  // keep them explicitly.
  outputFileTracingIncludes: {
    "/api/verify": ["./node_modules/tesseract.js/**", "./node_modules/tesseract.js-core/**"],
    "/api/batch": ["./node_modules/tesseract.js/**", "./node_modules/tesseract.js-core/**"],
  },
  // Pin the workspace root explicitly — the project lives under a directory
  // with spaces/no lockfile above it, which otherwise makes Turbopack guess wrong.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
