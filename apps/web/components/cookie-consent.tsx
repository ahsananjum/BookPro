"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShieldCheck, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function CookieConsent() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const consent = localStorage.getItem("bk_cookie_consent");
      if (!consent) {
        // Short delay so it doesn't flash immediately on initial load
        const timer = setTimeout(() => setVisible(true), 800);
        return () => clearTimeout(timer);
      }
    } catch {}
  }, []);

  const handleConsent = (choice: "accepted" | "essential") => {
    try {
      localStorage.setItem("bk_cookie_consent", choice);
      localStorage.setItem("bk_cookie_consent_date", new Date().toISOString());
    } catch {}
    setVisible(false);
  };

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.aside
          role="region"
          aria-label="Cookie and Privacy Preferences"
          initial={{ opacity: 0, y: 32, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.98 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: "20px",
            right: "20px",
            maxWidth: "460px",
            width: "calc(100% - 40px)",
            zIndex: 60,
            backgroundColor: "rgba(11, 17, 27, 0.96)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(56, 189, 248, 0.25)",
            borderRadius: "14px",
            padding: "18px 20px",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.7), 0 0 24px rgba(2, 132, 199, 0.15)",
            color: "#f8fafc",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                minWidth: "36px",
                borderRadius: "10px",
                backgroundColor: "rgba(2, 132, 199, 0.15)",
                border: "1px solid rgba(56, 189, 248, 0.3)",
                display: "grid",
                placeItems: "center",
                color: "#38bdf8",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
                <path d="M8.5 8.5v.01" />
                <path d="M16 15.5v.01" />
                <path d="M12 12v.01" />
                <path d="M11 17v.01" />
                <path d="M7 14v.01" />
              </svg>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
                <strong style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.01em" }}>
                  Cookie & Privacy Preferences
                </strong>
                <button
                  type="button"
                  onClick={() => handleConsent("essential")}
                  aria-label="Dismiss cookie notice"
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#64748b",
                    cursor: "pointer",
                    padding: "2px",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontSize: "12.5px", color: "#94a3b8", lineHeight: 1.55, margin: "0 0 14px 0" }}>
                BookPro uses essential cookies to authenticate your session and protect booking transactions. We also use analytics cookies to optimize scheduling performance. See our{" "}
                <Link
                  href="/privacy"
                  style={{ color: "#38bdf8", textDecoration: "underline", textUnderlineOffset: "3px" }}
                >
                  Privacy Policy
                </Link>{" "}
                and{" "}
                <Link
                  href="/terms"
                  style={{ color: "#38bdf8", textDecoration: "underline", textUnderlineOffset: "3px" }}
                >
                  Terms
                </Link>
                .
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => handleConsent("accepted")}
                  style={{
                    flex: "1 1 auto",
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #0284c7, #2563eb)",
                    border: "none",
                    color: "#ffffff",
                    fontSize: "12.5px",
                    fontWeight: 700,
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.35)",
                    transition: "opacity 0.15s ease",
                  }}
                >
                  Accept All
                </button>
                <button
                  type="button"
                  onClick={() => handleConsent("essential")}
                  style={{
                    padding: "8px 14px",
                    borderRadius: "8px",
                    background: "rgba(15, 23, 42, 0.8)",
                    border: "1px solid rgba(255, 255, 255, 0.14)",
                    color: "#cbd5e1",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  Essential Only
                </button>
              </div>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
