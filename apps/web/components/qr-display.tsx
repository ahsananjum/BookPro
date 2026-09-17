"use client";

import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

interface QrDisplayProps {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
  darkColor?: string;
  lightColor?: string;
}

export function QrDisplay({
  value,
  size = 200,
  alt = "QR Code Pass",
  className = "",
  darkColor = "#0f172a",
  lightColor = "#ffffff",
}: QrDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    let isCancelled = false;

    QRCode.toDataURL(value, {
      width: size,
      margin: 1,
      color: {
        dark: darkColor,
        light: lightColor,
      },
    })
      .then((url) => {
        if (!isCancelled) {
          setDataUrl(url);
          setError(null);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setError(err.message || "Failed to render QR Code");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [value, size, darkColor, lightColor]);

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          borderRadius: "12px",
          color: "#94a3b8",
          fontSize: "12px",
          textAlign: "center",
          padding: "8px",
        }}
      >
        QR Preview Error
      </div>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          backgroundColor: "#ffffff",
          borderRadius: "12px",
          color: "#64748b",
          fontSize: "12px",
        }}
      >
        Generating Pass…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-block",
        padding: "8px",
        backgroundColor: lightColor,
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      }}
      className={className}
    >
      <img
        src={dataUrl}
        alt={alt}
        width={size}
        height={size}
        style={{ display: "block", borderRadius: "6px" }}
      />
    </div>
  );
}
