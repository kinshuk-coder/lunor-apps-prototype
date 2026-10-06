import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosted Snack web runtime (see scripts/fetch-snack-runtime.mjs): the patched
  // index.html + bundle are served from public/v2/<sdk>/; every other runtime file
  // (images, fonts) is proxied to Expo's CDN. Public files win over afterFiles rewrites.
  async rewrites() {
    return [{ source: "/v2/:path*", destination: "https://snack-runtime.eascdn.net/v2/:path*" }];
  },
};

export default nextConfig;
