import type { NextConfig } from "next";
import { securityHeaders } from "./src/security/headers";
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  async headers() { return [{ source: "/:path*", headers: securityHeaders() }]; },
};
export default nextConfig;
