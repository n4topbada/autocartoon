import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoCartoon - 웹툰 캐릭터 이미지 생성",
  description: "웹툰 작가용 캐릭터 이미지 생성 웹서비스",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
