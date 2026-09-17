import React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  disabled,
  style,
  ...props
}) => {
  const baseStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans, sans-serif)",
    fontWeight: 600,
    borderRadius: "var(--radius-md, 0.625rem)",
    border: "1px solid transparent",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "all var(--dur-fast, 150ms) var(--ease-out, ease-out)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    opacity: disabled ? 0.5 : 1,
    whiteSpace: "nowrap",
    position: "relative",
    overflow: "hidden",
    ...style,
  };

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: {
      backgroundColor: "var(--color-primary, #6366f1)",
      color: "#ffffff",
      borderColor: "rgba(255, 255, 255, 0.1)",
      boxShadow: "0 4px 20px 0 oklch(58% 0.22 264 / 35%)",
    },
    secondary: {
      backgroundColor: "oklch(25% 0.03 260 / 60%)",
      color: "var(--color-ink, #f8fafc)",
      borderColor: "var(--color-border, rgba(255, 255, 255, 0.1))",
    },
    outline: {
      backgroundColor: "transparent",
      color: "var(--color-primary, #818cf8)",
      borderColor: "var(--color-border-glow, #6366f1)",
    },
    ghost: {
      backgroundColor: "transparent",
      color: "var(--color-ink-muted, #94a3b8)",
      borderColor: "transparent",
    },
    danger: {
      backgroundColor: "var(--color-danger, #ef4444)",
      color: "#ffffff",
      boxShadow: "0 4px 14px 0 oklch(63% 0.22 25 / 30%)",
    },
  };

  const sizeStyles: Record<string, React.CSSProperties> = {
    sm: { padding: "0.375rem 0.875rem", fontSize: "var(--text-xs, 0.75rem)" },
    md: { padding: "0.625rem 1.25rem", fontSize: "var(--text-sm, 0.875rem)" },
    lg: { padding: "0.75rem 1.75rem", fontSize: "var(--text-base, 1rem)" },
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        ...variantStyles[variant],
        ...sizeStyles[size],
      }}
      className={`bookpro-btn ${className}`}
      {...props}
    >
      {loading ? (
        <>
          <span
            style={{
              width: "1rem",
              height: "1rem",
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.75s linear infinite",
              display: "inline-block",
            }}
          />
          <span>Processing...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};
