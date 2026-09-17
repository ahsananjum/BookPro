"use client";

import React from "react";

export function CalendarPulse({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="calGrad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284c7" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="calBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Shadow / Base */}
      <rect x="8" y="14" width="48" height="42" rx="10" fill="rgba(15, 23, 42, 0.75)" stroke="url(#calGrad)" strokeWidth="1.5" />
      
      {/* Header bar */}
      <path d="M8 24C8 18.4772 12.4772 14 18 14H46C51.5228 14 56 18.4772 56 24V26H8V24Z" fill="url(#calGrad)" opacity="0.4" />
      <line x1="8" y1="26" x2="56" y2="26" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.5" />

      {/* Rings on top */}
      <rect x="18" y="8" width="4" height="10" rx="2" fill="#38bdf8">
        <animate attributeName="y" values="8;6;8" dur="3s" repeatCount="indefinite" />
      </rect>
      <rect x="42" y="8" width="4" height="10" rx="2" fill="#38bdf8">
        <animate attributeName="y" values="8;6;8" dur="3s" repeatCount="indefinite" begin="0.2s" />
      </rect>

      {/* Grid dots / slots */}
      <circle cx="18" cy="34" r="2.5" fill="#64748b" />
      <circle cx="28" cy="34" r="2.5" fill="#64748b" />
      <circle cx="38" cy="34" r="2.5" fill="#64748b" />
      <circle cx="48" cy="34" r="2.5" fill="#64748b" />

      <circle cx="18" cy="44" r="2.5" fill="#64748b" />
      <circle cx="28" cy="44" r="2.5" fill="#64748b" />

      {/* Live Pulsing Selected Slot */}
      <g filter="url(#calBlur)">
        <rect x="34" y="40" width="18" height="10" rx="4" fill="#0284c7">
          <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
        </rect>
        <circle cx="43" cy="45" r="2" fill="#ffffff">
          <animate attributeName="r" values="2;3.2;2" dur="2s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export function ClockSpinner({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="clockRing" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#0284c7" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* Outer Dial */}
      <circle cx="32" cy="32" r="26" stroke="url(#clockRing)" strokeWidth="2" strokeDasharray="3 3" opacity="0.6">
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="40s" repeatCount="indefinite" />
      </circle>

      <circle cx="32" cy="32" r="22" fill="rgba(15, 23, 42, 0.85)" stroke="#334155" strokeWidth="1.5" />

      {/* Minute Markers */}
      <circle cx="32" cy="14" r="1.5" fill="#38bdf8" />
      <circle cx="50" cy="32" r="1.5" fill="#38bdf8" />
      <circle cx="32" cy="50" r="1.5" fill="#38bdf8" />
      <circle cx="14" cy="32" r="1.5" fill="#38bdf8" />

      {/* Hour Hand */}
      <line x1="32" y1="32" x2="32" y2="20" stroke="#f8fafc" strokeWidth="2.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="24s" repeatCount="indefinite" />
      </line>

      {/* Minute Hand */}
      <line x1="32" y1="32" x2="32" y2="16" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="4s" repeatCount="indefinite" />
      </line>

      {/* Center Pivot */}
      <circle cx="32" cy="32" r="3" fill="#38bdf8" />
      <circle cx="32" cy="32" r="1.5" fill="#0f172a" />
    </svg>
  );
}

export function ShieldLock({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="shieldGrad" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#0284c7" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>

      {/* Pulsing Outer Shield Ring */}
      <path
        d="M32 6L50 14V28C50 41.5 42 51.5 32 58C22 51.5 14 41.5 14 28V14L32 6Z"
        stroke="url(#shieldGrad)"
        strokeWidth="1.5"
        fill="rgba(14, 165, 233, 0.05)"
      >
        <animate attributeName="stroke-opacity" values="0.4;1;0.4" dur="3s" repeatCount="indefinite" />
      </path>

      {/* Inner Solid Shield */}
      <path
        d="M32 10L46 16.5V28C46 38.8 39.8 47 32 52.8C24.2 47 18 38.8 18 28V16.5L32 10Z"
        fill="rgba(15, 23, 42, 0.85)"
        stroke="#1e293b"
        strokeWidth="1"
      />

      {/* Lock Shackle */}
      <path
        d="M26 29V24C26 20.6863 28.6863 18 32 18C35.3137 18 38 20.6863 38 24V29"
        stroke="#38bdf8"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        <animate attributeName="stroke" values="#38bdf8;#a855f7;#38bdf8" dur="4s" repeatCount="indefinite" />
      </path>

      {/* Lock Body */}
      <rect x="23" y="28" width="18" height="14" rx="3" fill="#0284c7" stroke="#38bdf8" strokeWidth="1" />
      <circle cx="32" cy="34" r="2" fill="#f8fafc" />
      <line x1="32" y1="36" x2="32" y2="39" stroke="#f8fafc" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function WaveformBars({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.6" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>

      {/* 5 Equalizer Bars with offset height animations */}
      <rect x="12" y="24" width="5" height="16" rx="2.5" fill="url(#waveGrad)">
        <animate attributeName="height" values="12;28;14;34;12" dur="1.8s" repeatCount="indefinite" />
        <animate attributeName="y" values="26;18;25;15;26" dur="1.8s" repeatCount="indefinite" />
      </rect>

      <rect x="21" y="16" width="5" height="32" rx="2.5" fill="url(#waveGrad)">
        <animate attributeName="height" values="32;14;36;20;32" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="y" values="16;25;14;22;16" dur="1.5s" repeatCount="indefinite" />
      </rect>

      <rect x="30" y="12" width="5" height="40" rx="2.5" fill="url(#waveGrad)">
        <animate attributeName="height" values="40;22;42;16;40" dur="2.1s" repeatCount="indefinite" />
        <animate attributeName="y" values="12;21;11;24;12" dur="2.1s" repeatCount="indefinite" />
      </rect>

      <rect x="39" y="18" width="5" height="28" rx="2.5" fill="url(#waveGrad)">
        <animate attributeName="height" values="28;38;16;32;28" dur="1.7s" repeatCount="indefinite" />
        <animate attributeName="y" values="18;13;24;16;18" dur="1.7s" repeatCount="indefinite" />
      </rect>

      <rect x="48" y="24" width="5" height="16" rx="2.5" fill="url(#waveGrad)">
        <animate attributeName="height" values="16;26;12;30;16" dur="1.9s" repeatCount="indefinite" />
        <animate attributeName="y" values="24;19;26;17;24" dur="1.9s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

export function OrbitRings({ size = 56, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="orbitGlow" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0284c7" stopOpacity="0.8" />
          <stop offset="0.5" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Outer Ellipse Orbit 1 */}
      <ellipse cx="40" cy="40" rx="34" ry="14" stroke="url(#orbitGlow)" strokeWidth="1.5" strokeDasharray="4 2">
        <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="20s" repeatCount="indefinite" />
      </ellipse>

      {/* Orbit 2 at 60deg */}
      <g transform="rotate(60 40 40)">
        <ellipse cx="40" cy="40" rx="34" ry="14" stroke="url(#orbitGlow)" strokeWidth="1.5" strokeDasharray="4 2">
          <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="-360 40 40" dur="25s" repeatCount="indefinite" />
        </ellipse>
      </g>

      {/* Orbit 3 at 120deg */}
      <g transform="rotate(120 40 40)">
        <ellipse cx="40" cy="40" rx="34" ry="14" stroke="url(#orbitGlow)" strokeWidth="1.5">
          <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="30s" repeatCount="indefinite" />
        </ellipse>
      </g>

      {/* Core Node */}
      <circle cx="40" cy="40" r="8" fill="url(#orbitGlow)">
        <animate attributeName="r" values="7.5;9;7.5" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="40" cy="40" r="4" fill="#f8fafc" />

      {/* Satellite particle */}
      <circle cx="68" cy="40" r="3.5" fill="#38bdf8">
        <animateTransform attributeName="transform" type="rotate" from="0 40 40" to="360 40 40" dur="5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function CheckmarkDraw({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" fill="rgba(5, 150, 105, 0.2)" stroke="#10b981" strokeWidth="2">
        <animate attributeName="stroke-dasharray" values="0 130; 130 0" dur="0.8s" fill="freeze" />
      </circle>
      <path
        d="M14 24L21 31L34 17"
        stroke="#34d399"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <animate attributeName="stroke-dasharray" values="0 40; 40 0" dur="0.6s" begin="0.3s" fill="freeze" />
      </path>
    </svg>
  );
}

export function StackedCards({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="cardGrad1" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1e293b" />
          <stop offset="1" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="cardBorder" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>

      {/* Card 3 (Back) */}
      <rect x="20" y="8" width="36" height="28" rx="6" fill="rgba(30, 41, 59, 0.5)" stroke="#334155" strokeWidth="1" />

      {/* Card 2 (Middle) */}
      <rect x="14" y="16" width="36" height="28" rx="6" fill="rgba(15, 23, 42, 0.75)" stroke="#475569" strokeWidth="1" />

      {/* Card 1 (Front Active 3D) */}
      <g>
        <rect x="8" y="24" width="36" height="28" rx="6" fill="url(#cardGrad1)" stroke="url(#cardBorder)" strokeWidth="1.5" />
        <circle cx="16" cy="32" r="3" fill="#38bdf8" />
        <rect x="23" y="30" width="14" height="4" rx="2" fill="#94a3b8" />
        <rect x="15" y="39" width="22" height="4" rx="2" fill="#475569" />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -3; 0 0"
          dur="3.5s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

export function PulsingDot({ color = "#38bdf8", size = 8 }: { color?: string; size?: number }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: size * 2,
        height: size * 2,
      }}
      aria-hidden="true"
    >
      <span
        style={{
          position: "absolute",
          width: size * 2,
          height: size * 2,
          borderRadius: "50%",
          backgroundColor: color,
          opacity: 0.4,
          animation: "pulseGlow 2s infinite ease-in-out",
        }}
      />
      <span
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
    </span>
  );
}

export function FloatingParticles({ count = 12 }: { count?: number }) {
  const particles = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        left: `${(i * 19 + 7) % 95}%`,
        top: `${(i * 23 + 13) % 90}%`,
        size: (i % 3) + 2,
        duration: (i % 5) + 6,
        delay: (i % 4) * 1.2,
      })),
    [count]
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0,
      }}
      aria-hidden="true"
    >
      {particles.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "50%",
            backgroundColor: p.id % 2 === 0 ? "rgba(56, 189, 248, 0.45)" : "rgba(124, 58, 237, 0.45)",
            filter: "blur(1px)",
            boxShadow: `0 0 ${p.size * 3}px ${p.id % 2 === 0 ? "#38bdf8" : "#8b5cf6"}`,
            animation: `floatParticle ${p.duration}s infinite ease-in-out ${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

export function QrCodeScan({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Corner Brackets */}
      <path d="M8 20V12C8 9.79086 9.79086 8 12 8H20" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M44 8H52C54.2091 8 56 9.79086 56 12V20" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M56 44V52C56 54.2091 54.2091 56 52 56H44" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M20 56H12C9.79086 56 8 54.2091 8 52V44" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />

      {/* QR Matrix Bits */}
      <rect x="14" y="14" width="10" height="10" rx="2" stroke="#f8fafc" strokeWidth="2" />
      <rect x="17" y="17" width="4" height="4" fill="#38bdf8" />

      <rect x="40" y="14" width="10" height="10" rx="2" stroke="#f8fafc" strokeWidth="2" />
      <rect x="43" y="17" width="4" height="4" fill="#38bdf8" />

      <rect x="14" y="40" width="10" height="10" rx="2" stroke="#f8fafc" strokeWidth="2" />
      <rect x="17" y="43" width="4" height="4" fill="#38bdf8" />

      <rect x="36" y="36" width="6" height="6" rx="1" fill="#64748b" />
      <rect x="46" y="46" width="6" height="6" rx="1" fill="#64748b" />
      <rect x="44" y="34" width="4" height="4" rx="1" fill="#38bdf8" />

      {/* Laser Scanning Line */}
      <line x1="10" y1="32" x2="54" y2="32" stroke="#38bdf8" strokeWidth="2" opacity="0.8">
        <animate attributeName="y1" values="12;52;12" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="y2" values="12;52;12" dur="2.5s" repeatCount="indefinite" />
      </line>
    </svg>
  );
}

export function SparklesGlow({ size = 32, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38bdf8" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
      </defs>
      {/* Primary 4-point Star */}
      <path
        d="M24 4C24 15.0457 15.0457 24 4 24C15.0457 24 24 32.9543 24 44C24 32.9543 32.9543 24 44 24C32.9543 24 24 15.0457 24 4Z"
        fill="url(#sparkGrad)"
      >
        <animateTransform
          attributeName="transform"
          type="scale"
          values="0.85;1.1;0.85"
          origin="24 24"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </path>
      {/* Mini Secondary Star */}
      <circle cx="38" cy="10" r="3" fill="#38bdf8">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="10" cy="38" r="2.5" fill="#c084fc">
        <animate attributeName="opacity" values="1;0.3;1" dur="2.1s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

export function MapPinPulse({ size = 44, className = "", color = "#38bdf8" }: { size?: number; className?: string; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Ground Pulse Ring */}
      <ellipse cx="24" cy="42" rx="14" ry="4" fill={color} opacity="0.2">
        <animate attributeName="rx" values="8;16;8" dur="2.5s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2.5s" repeatCount="indefinite" />
      </ellipse>

      {/* Pin Body */}
      <g>
        <path
          d="M24 6C16.268 6 10 12.268 10 20C10 29.5 24 42 24 42C24 42 38 29.5 38 20C38 12.268 31.732 6 24 6Z"
          fill="rgba(15, 23, 42, 0.9)"
          stroke={color}
          strokeWidth="2"
        />
        <circle cx="24" cy="19" r="5" fill={color} />
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 0; 0 -4; 0 0"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}
