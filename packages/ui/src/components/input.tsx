import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = "", style, id, disabled, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", width: "100%" }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: "var(--text-xs, 0.75rem)",
              fontWeight: 600,
              color: "var(--color-ink-muted, #94a3b8)",
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          style={{
            width: "100%",
            backgroundColor: "var(--color-paper-card, rgba(18, 24, 38, 0.75))",
            border: error
              ? "1px solid var(--color-danger, #ef4444)"
              : "1px solid var(--color-border, rgba(255, 255, 255, 0.08))",
            borderRadius: "var(--radius-md, 0.625rem)",
            padding: "0.625rem 0.875rem",
            color: "var(--color-ink, #f8fafc)",
            fontFamily: "var(--font-sans, sans-serif)",
            fontSize: "var(--text-sm, 0.875rem)",
            outline: "none",
            transition: "border-color var(--dur-fast, 150ms) var(--ease-out, ease-out), box-shadow var(--dur-fast, 150ms) var(--ease-out, ease-out)",
            cursor: disabled ? "not-allowed" : "text",
            opacity: disabled ? 0.5 : 1,
            ...style,
          }}
          className={`bookpro-input ${className}`}
          {...props}
        />
        {error && (
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--color-danger, #ef4444)",
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            {error}
          </span>
        )}
        {!error && helperText && (
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--color-ink-dim, #64748b)",
              fontFamily: "var(--font-sans, sans-serif)",
            }}
          >
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
