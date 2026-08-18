import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "로또 6/45 시뮬레이터 | 행운연구소",
  description:
    "나의 번호 1장과 자동번호 99장을 매주 구매하면 언제 1등에 당첨될지 시뮬레이션해보세요.",
  openGraph: {
    title: "매주 100장, 언제 1등이 될까?",
    description: "로또 6/45 첫 1등까지의 시간과 비용을 직접 실험해보세요.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
