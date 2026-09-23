import "./globals.css";
import React from "react";
import type { Metadata, Viewport } from "next";
import { Providers } from "./providers";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#050a17",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://bookpro-fawn.vercel.app"),
  title: {
    default: "BookPro — Autonomous Studio & Appointment Engine",
    template: "%s | BookPro",
  },
  description: "Enterprise multi-tenant booking, real-time calendar synchronization, AI receptionist, and client CRM platform for modern service businesses.",
  keywords: [
    "booking system",
    "appointment scheduling",
    "salon booking",
    "spa management",
    "calendar synchronization",
    "AI receptionist",
    "client portal",
    "Stripe payments",
  ],
  authors: [{ name: "BookPro Platform" }],
  creator: "BookPro",
  publisher: "BookPro",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://bookpro-fawn.vercel.app",
    title: "BookPro — Autonomous Studio & Appointment Engine",
    description: "Next-generation booking, calendar management, and CRM platform.",
    siteName: "BookPro",
  },
  twitter: {
    card: "summary_large_image",
    title: "BookPro — Autonomous Studio & Appointment Engine",
    description: "Next-generation booking, calendar management, and CRM platform.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
