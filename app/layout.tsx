import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IllustrateLab",
  description: "Generate and customize vector-style AI illustrations.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

