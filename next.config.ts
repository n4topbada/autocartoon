import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  // @vercel/oidc reads the Node entrypoint when it falls back to the local CLI.
  // Keeping it external avoids Webpack replacing require.main with a module
  // object that has no filename during Next.js page-data collection on Windows.
  serverExternalPackages: ["@vercel/oidc"],
};

export default withWorkflow(nextConfig);
