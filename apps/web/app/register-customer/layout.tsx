import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Create Client Account",
  description: "Create your personal BookPro client profile to manage bookings and appointment receipts.",
};

export default function RegisterCustomerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
