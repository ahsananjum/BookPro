import React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "info" | "success" | "warning" | "error" | "neutral";
  size?: "sm" | "md";
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = "info",
  size = "md",
  className = "",
  style,
  ...props
}) => {
  const styles: Record<string, { bg: string; text: string; border: string }> = {
    info: {
      bg: "var(--color-primary-subtle, oklch(58% 0.22 264 / 15%))",
      text: "var(--color-accent, oklch(72% 0.17 210))",
      border: "var(--color-border-glow, oklch(62% 0.22 260 / 40%))",
    },
    success: {
      bg: "var(--color-success-bg, oklch(72% 0.19 145 / 15%))",
      text: "var(--color-success, oklch(72% 0.19 145))",
      border: "oklch(72% 0.19 145 / 35%)",
    },
    warning: {
      bg: "var(--color-warning-bg, oklch(80% 0.18 85 / 15%))",
      text: "var(--color-warning, oklch(80% 0.18 85))",
      border: "oklch(80% 0.18 85 / 35%)",
    },
    error: {
      bg: "var(--color-danger-bg, oklch(63% 0.22 25 / 15%))",
      text: "var(--color-danger, oklch(63% 0.22 25))",
      border: "oklch(63% 0.22 25 / 35%)",
    },
    neutral: {
      bg: "oklch(25% 0.02 260 / 60%)",
      text: "var(--color-ink-muted, #94a3b8)",
      border: "var(--color-border, rgba(255, 255, 255, 0.1))",
    },
  };

  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: size === "sm" ? "0.125rem 0.5rem" : "0.25rem 0.75rem",
    borderRadius: "var(--radius-full, 9999px)",
    fontSize: size === "sm" ? "0.7rem" : "0.75rem",
    fontWeight: 600,
    fontFamily: "var(--font-mono, monospace)",
    letterSpacing: "0.02em",
    backgroundColor: styles[variant].bg,
    color: styles[variant].text,
    border: `1px solid ${styles[variant].border}`,
    whiteSpace: "nowrap",
    ...style,
  };

  return (
    <span style={badgeStyle} className={`bookpro-badge ${className}`} {...props}>
      {children}
    </span>
  );
};
