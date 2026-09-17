import React from "react";

export const metadata = {
    title: "BookPro — Business Onboarding & Setup",
    description: "Guided 11-step organization setup for BookPro.",
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
    return <div style={{ minHeight: "100vh", backgroundColor: "#060913" }}>{children}</div>;
}
