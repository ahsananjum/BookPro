import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  glow = false,
  interactive = false,
  className = "",
  style,
  ...props
}) => {
  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--color-paper-card, rgba(18, 24, 38, 0.75))",
    backdropFilter: "var(--glass-backdrop-filter, blur(16px))",
    WebkitBackdropFilter: "var(--glass-backdrop-filter, blur(16px))",
    borderRadius: "var(--radius-lg, 1rem)",
    border: glow
      ? "1px solid var(--color-border-glow, rgba(99, 102, 241, 0.5))"
      : "1px solid var(--color-border, rgba(255, 255, 255, 0.08))",
    boxShadow: glow
      ? "var(--glass-glow-shadow, 0 0 30px 0 oklch(58% 0.22 264 / 25%))"
      : "var(--glass-box-shadow, 0 12px 40px 0 rgba(0, 0, 0, 0.45))",
    padding: "var(--space-6, 1.5rem)",
    color: "var(--color-ink, #f8fafc)",
    transition: "transform var(--dur-fast, 150ms) var(--ease-out, ease-out), border-color var(--dur-fast, 150ms) var(--ease-out, ease-out), box-shadow var(--dur-fast, 150ms) var(--ease-out, ease-out)",
    cursor: interactive ? "pointer" : "default",
    ...style,
  };

  return (
    <div
      style={cardStyle}
      className={`bookpro-card ${glow ? "glow" : ""} ${interactive ? "interactive" : ""} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
