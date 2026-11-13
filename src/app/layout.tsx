import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://business.worklex.at"),
  title: {
    default: "WORKLEX Business – Dein Unternehmensportal",
    template: "%s | WORKLEX Business",
  },
  description:
    "WORKLEX Business – dein digitales Unternehmensportal für Finanzen, Organisation und Unternehmensverwaltung.",
  applicationName: "WORKLEX Business",
  icons: {
    icon: "/worklex-icon-glas.png",
    shortcut: "/worklex-icon-glas.png",
    apple: "/worklex-icon-glas.png",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
