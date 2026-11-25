import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "בודק הודעות חשודות",
  description: "בדיקה מקומית של סימני אזהרה בהודעות חשודות.",
  applicationName: "ScamChecker",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/scamchecker-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/scamchecker-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/scamchecker-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b5864",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
