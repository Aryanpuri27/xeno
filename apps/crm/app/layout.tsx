import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Xeno CRM — AI-Native Campaign Platform",
    template: "%s | Xeno CRM",
  },
  description:
    "AI-powered CRM platform for Nike. Describe your goal in plain English and let the AI orchestrate your campaign — audience, products, message, channel — with human-in-the-loop review at every step.",
  keywords: ["CRM", "AI", "Nike", "campaign management", "marketing automation"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
