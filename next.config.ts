import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // 상위 사용자 폴더의 다른 lockfile을 모노레포 루트로 오인하지 않게 한다.
  outputFileTracingRoot: process.cwd(),
  // 런타임 경로로 JSON/proto를 읽는 패키지는 Webpack 서버 번들에서 제외한다.
  serverExternalPackages: ["@google-cloud/tasks", "mammoth", "pdf-parse"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Cloud Run 컨테이너 배포 시에만 standalone 출력을 켠다.
  ...(process.env.BUILD_TARGET === "cloudrun" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
