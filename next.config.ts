import type { NextConfig } from "next";
import { securityHeaders } from "./src/security/headers";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  async headers() { return [
    { source: "/:path*", headers: securityHeaders() },
    { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/favicon.svg", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] },
  ]; },
};
export default nextConfig;
