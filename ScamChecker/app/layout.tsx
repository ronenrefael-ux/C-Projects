import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "בודק הודעות חשודות",
  description: "בדיקה מקומית של סימני אזהרה בהודעות חשודות.",
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
