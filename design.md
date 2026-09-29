# BookPro visual design

BookPro uses a dark, modern interface for customer booking and business operations. The visual system pairs deep navy surfaces with restrained blue and cyan accents, clear contrast, and compact operational details.

## Visual direction

- **Surfaces:** Midnight navy canvas with layered, translucent panels and subtle borders. Use blur selectively so content remains legible.
- **Accent colors:** Blue for primary actions, cyan for focus and informational emphasis, green for success, amber for warnings, and rose for errors.
- **Typography:** Use a clear display face for headings, readable sans-serif body text, and monospace sparingly for technical metadata.
- **Motion:** Keep transitions short and purposeful. Avoid movement that competes with scheduling information or makes controls harder to use.
- **Content:** Show real product data and meaningful empty states. Avoid fabricated metrics or decorative elements that resemble application controls.

## Design tokens

The root token stylesheet is the source of truth for values in use. The following values describe the current Midnight palette direction:

```css
:root {
  --bp-bg-canvas: oklch(12% 0.02 260);
  --bp-bg-surface: rgba(15, 23, 42, 0.75);
  --bp-bg-surface-elevated: rgba(30, 41, 59, 0.65);
  --bp-bg-input: rgba(15, 23, 42, 0.85);
  --bp-border-subtle: rgba(255, 255, 255, 0.08);
  --bp-border-strong: rgba(255, 255, 255, 0.16);
  --bp-border-focus: #38bdf8;
  --bp-accent-primary: #0284c7;
  --bp-accent-cyan: #38bdf8;
  --bp-success: #10b981;
  --bp-warning: #f59e0b;
  --bp-error: #f43f5e;
  --bp-text-primary: #f8fafc;
  --bp-text-secondary: #cbd5e1;
  --bp-text-muted: #94a3b8;
  --bp-text-dim: #64748b;
}
```

## Interaction and accessibility

Interactive components should provide visible hover, keyboard-focus, active, disabled, loading, error, and success states where those states apply. Keep focus indicators visible, associate validation messages with their fields, and avoid relying on color alone to communicate status.

## Business registration flow

Business registration collects administrator and organization details, checks booking URL slug availability, then directs the user to email verification. Verification messages are dispatched through the outbox and the configured transactional email provider (Brevo when enabled). Keep UI copy aligned with the implemented flow and avoid promising provider behavior when the integration is not configured.
