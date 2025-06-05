import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Header } from "../src/widgets/Header";

const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

export const metadata: Metadata = {
  title: {
    template: "%s | Byoo.log",
    default: "Byoo.log", // a default is required when creating a template
  },
  description: "Byoo의 블로그 입니다.",
  keywords: ["Byoo", "byoo", "blog", "블로그", "Frontend", "frontend"],
  twitter: { card: "summary" },
  openGraph: {
    title: `Byoo.log`,
  },
  verification: {
    google: "0BW-eD27UKencfPvnJUel9FICKrudtn1HkEK3hK4MtE",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${pretendard.variable} font-pretendard antialiased mx-auto max-w-screen-md px-5 py-12`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
