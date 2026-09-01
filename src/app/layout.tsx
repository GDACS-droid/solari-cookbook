import type { Metadata } from "next";
import "./globals.css";

const siteUrl = "https://acrebrief.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AcreBrief | Property distress, with evidence",
    template: "%s | AcreBrief",
  },
  description:
    "Evidence-first public-record property intelligence for Southwest Florida acquisition teams.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "AcreBrief",
    title: "AcreBrief | Property distress, with evidence",
    description:
      "A live, evidence-backed property investigation across approved Florida government data sources.",
  },
  twitter: {
    card: "summary",
    title: "AcreBrief | Property distress, with evidence",
    description:
      "A live, evidence-backed property investigation across approved Florida government data sources.",
  },
  robots: { index: true, follow: true },
};

const organizationStructuredData = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "AcreBrief",
  url: siteUrl,
  description: "Public-record property intelligence for real-estate acquisition teams.",
};

function serializeStructuredData(value: object) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeStructuredData(organizationStructuredData) }}
        />
        {children}
      </body>
    </html>
  );
}
