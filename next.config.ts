import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // alasql ships Node/React-Native file-system requires that the bundler can't
  // statically resolve; load it via native require at runtime instead.
  serverExternalPackages: ["alasql"],
};

export default nextConfig;
