"use client";

import React, { useRef, useState } from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  glow?: "primary" | "accent" | "subtle" | "none";
  interactive?: boolean;
  depth3D?: boolean;
  variant?: "card" | "panel" | "elevated" | "hero";
  onClick?: () => void;
}

export function GlassCard({
  children,
  className = "",
  glow = "subtle",
  interactive = false,
  depth3D = false,
  variant = "card",
  style,
  onClick,
  ...rest
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  const [tilt, setTilt] = useState({ x: 0, y: 0, mouseX: 0, mouseY: 0 });

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!depth3D || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    const xPct = clientX / width - 0.5;
    const yPct = clientY / height - 0.5;

    setTilt({ x: yPct * -8, y: xPct * 8, mouseX: clientX, mouseY: clientY });
  }

  function handleMouseLeave() {
    if (!depth3D) return;
    setTilt((current) => ({ ...current, x: 0, y: 0 }));
  }

  const glowStyles: Record<string, React.CSSProperties> = {
    primary: {
      borderColor: "rgba(56, 189, 248, 0.4)",
      boxShadow: "0 10px 30px -10px rgba(2, 132, 199, 0.45), 0 0 20px 0 rgba(56, 189, 248, 0.15)",
    },
    accent: {
      borderColor: "rgba(124, 58, 237, 0.4)",
      boxShadow: "0 10px 30px -10px rgba(124, 58, 237, 0.45), 0 0 20px 0 rgba(168, 85, 247, 0.15)",
    },
    subtle: {
      borderColor: "rgba(255, 255, 255, 0.08)",
      boxShadow: "0 12px 36px 0 rgba(0, 0, 0, 0.45)",
    },
    none: {
      borderColor: "rgba(255, 255, 255, 0.06)",
      boxShadow: "none",
    },
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    card: {
      background: "linear-gradient(135deg, rgba(15, 23, 42, 0.75) 0%, rgba(10, 15, 29, 0.85) 100%)",
      backdropFilter: "blur(16px) saturate(180%)",
      WebkitBackdropFilter: "blur(16px) saturate(180%)",
      borderRadius: "16px",
      borderWidth: "1px",
      borderStyle: "solid",
      padding: "24px",
    },
    panel: {
      background: "rgba(11, 17, 27, 0.82)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      borderRadius: "14px",
      borderWidth: "1px",
      borderStyle: "solid",
      padding: "20px",
    },
    elevated: {
      background: "linear-gradient(145deg, rgba(20, 30, 48, 0.88) 0%, rgba(12, 19, 32, 0.95) 100%)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderRadius: "20px",
      borderWidth: "1px",
      borderStyle: "solid",
      padding: "32px",
    },
    hero: {
      background: "radial-gradient(circle at 50% 0%, rgba(14, 116, 144, 0.18), transparent 70%), rgba(10, 16, 28, 0.85)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderRadius: "24px",
      borderWidth: "1px",
      borderStyle: "solid",
      padding: "36px",
    },
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        ...variantStyles[variant],
        ...glowStyles[glow],
        position: "relative",
        overflow: "hidden",
        cursor: interactive || onClick ? "pointer" : "default",
        transformStyle: depth3D ? "preserve-3d" : undefined,
        transform: depth3D ? `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` : undefined,
        transition: "transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 180ms ease, box-shadow 180ms ease",
        ...style,
      }}
      className={`glass-card ${className}`}
      {...rest}
    >
      {/* 3D Spotlight Glow Layer */}
      {depth3D && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `radial-gradient(400px circle at ${tilt.mouseX}px ${tilt.mouseY}px, rgba(56, 189, 248, 0.12), transparent 80%)`,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {/* Card Content Container */}
      <div style={{ position: "relative", zIndex: 2 }}>{children}</div>
    </div>
  );
}

export function GlassBadge({
  children,
  variant = "info",
  size = "md",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warning" | "purple" | "default" | "danger";
  size?: "sm" | "md";
}) {
  const styles: Record<string, React.CSSProperties> = {
    default: {
      backgroundColor: "rgba(255, 255, 255, 0.05)",
      borderColor: "rgba(255, 255, 255, 0.12)",
      color: "#94a3b8",
    },
    info: {
      backgroundColor: "rgba(2, 132, 199, 0.15)",
      borderColor: "rgba(56, 189, 248, 0.35)",
      color: "#7dd3fc",
    },
    success: {
      backgroundColor: "rgba(5, 150, 105, 0.15)",
      borderColor: "rgba(52, 211, 153, 0.35)",
      color: "#6ee7b7",
    },
    warning: {
      backgroundColor: "rgba(217, 119, 6, 0.15)",
      borderColor: "rgba(251, 191, 36, 0.35)",
      color: "#fcd34d",
    },
    danger: {
      backgroundColor: "rgba(225, 29, 72, 0.15)",
      borderColor: "rgba(251, 113, 133, 0.35)",
      color: "#fda4af",
    },
    purple: {
      backgroundColor: "rgba(124, 58, 237, 0.15)",
      borderColor: "rgba(168, 85, 247, 0.35)",
      color: "#c084fc",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: size === "sm" ? "2px 8px" : "4px 12px",
        borderRadius: "9999px",
        borderWidth: "1px",
        borderStyle: "solid",
        fontSize: size === "sm" ? "11px" : "12px",
        fontWeight: "700",
        letterSpacing: "0.02em",
        backdropFilter: "blur(8px)",
        ...styles[variant],
      }}
    >
      {children}
    </span>
  );
}
