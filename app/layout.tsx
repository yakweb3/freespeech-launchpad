import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FreeSpeech — Token communities on Solana",
  description: "Launch a token on pump.fun and bring your holders together in their own community room.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
