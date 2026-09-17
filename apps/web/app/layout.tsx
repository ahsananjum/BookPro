import "./globals.css";
import React from "react";
import { Providers } from "./providers";

export const metadata = {
  title: "BookPro — Enterprise Multi-Tenant Scheduling Platform",
  description: "Next-generation booking, calendar management, and CRM platform.",
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
