import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Cloud Run 컨테이너 배포 시에만 standalone 출력을 켠다.
  ...(process.env.BUILD_TARGET === "cloudrun" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
