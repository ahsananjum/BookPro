import type { Metadata } from "next";
import React from "react";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const formattedSlug = params?.slug
    ? params.slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    : "Studio";

  return {
    title: `Book Online — ${formattedSlug}`,
    description: `Book your appointment with ${formattedSlug} on BookPro. Select services, specialists, and secure reservations online.`,
  };
}

export default function BookingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
