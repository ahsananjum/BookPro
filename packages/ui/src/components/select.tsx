import React from "react";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: { value: string | number; label: string }[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, children, className = "", style, id, disabled, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem", width: "100%" }}>
        {label && (
          <label
            htmlFor={selectId}
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
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          style={{
            width: "100%",
            backgroundColor: "var(--color-paper-elevated, oklch(22% 0.035 260))",
            border: error
              ? "1px solid var(--color-danger, #ef4444)"
              : "1px solid var(--color-border, rgba(255, 255, 255, 0.08))",
            borderRadius: "var(--radius-md, 0.625rem)",
            padding: "0.625rem 0.875rem",
            color: "var(--color-ink, #f8fafc)",
            fontFamily: "var(--font-sans, sans-serif)",
            fontSize: "var(--text-sm, 0.875rem)",
            outline: "none",
            transition: "border-color var(--dur-fast, 150ms) var(--ease-out, ease-out)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
            ...style,
          }}
          className={`bookpro-select ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} style={{ backgroundColor: "#1e293b", color: "#f8fafc" }}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
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
      </div>
    );
  }
);

Select.displayName = "Select";
