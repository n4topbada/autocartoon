import type { Metadata } from "next";
import CouponLanding from "@/components/CouponLanding";

export const metadata: Metadata = {
  title: "쿠폰 받기 | 워니바나나봇",
  description: "워니바나나봇 크레딧 쿠폰을 등록합니다.",
};

export default async function CouponPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <CouponLanding initialCode={code} />;
}
