import type { Metadata } from "next";
import { Geist, Geist_Mono, Orbitron, Rajdhani } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "DISTORT — Freedom Beyond Borders",
  description:
    "DISTORT is a 100% free, next-generation VPN built to keep you online even when the internet goes dark. Multi-protocol, anti-censorship, Iran-resilient.",
  keywords: [
    "DISTORT",
    "VPN",
    "free VPN",
    "anti-censorship",
    "Iran VPN",
    "WireGuard",
    "V2Ray",
    "Trojan",
    "Shadowsocks",
    "freedom",
  ],
  authors: [{ name: "DISTORT" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "DISTORT — Freedom Beyond Borders",
    description:
      "100% free, next-gen VPN. Stays online when the internet goes dark.",
    siteName: "DISTORT",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DISTORT — Freedom Beyond Borders",
    description: "100% free, next-gen VPN. Stays online when the internet goes dark.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${orbitron.variable} ${rajdhani.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="bottom-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
