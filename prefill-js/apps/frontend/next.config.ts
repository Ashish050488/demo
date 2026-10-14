import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The shared validation package is plain ES modules inside the workspace.
  transpilePackages: ["@prefill/shared"],
  // Dev-only badge; bottom-left would cover the review sidebar buttons.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
