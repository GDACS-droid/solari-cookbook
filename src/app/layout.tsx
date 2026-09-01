import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AcreBrief | Property distress, with evidence",
  description:
    "Evidence-first public-record property intelligence for Southwest Florida acquisition teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
