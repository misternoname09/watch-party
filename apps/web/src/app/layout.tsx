import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Watch Party | Sync YouTube & Netflix",
  description: "Watch your favorite videos together in perfect sync with friends. Real-time synchronization for YouTube and Netflix.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
