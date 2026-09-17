"use client";

import React, { useState, useRef, useMemo } from "react";
import { formatCurrency, getCurrencySymbol } from "../lib/currency-utils";
import { motion, AnimatePresence } from "framer-motion";

// ==========================================
// 1. REVENUE & CASH INFLOW AREA/LINE SVG CHART
// ==========================================

interface RevenueTrendSvgChartProps {
  dates: string[];
  bookedRevenue: number[]; // In major units (dollars, rupees, euros)
  collectedRevenue: number[]; // In major units
  currency: string;
}

export function RevenueTrendSvgChart({
  dates,
  bookedRevenue,
  collectedRevenue,
  currency,
}: RevenueTrendSvgChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const {
    pointsBooked,
    pointsCollected,
    pathBookedArea,
    pathBookedLine,
    pathCollectedLine,
    pathCollectedArea,
    yTicks,
  } = useMemo(() => {
    const count = Math.max(dates.length, 1);
    const maxB = Math.max(...bookedRevenue, 0);
    const maxC = Math.max(...collectedRevenue, 0);
    const rawMax = Math.max(maxB, maxC, 10);
    // Add 20% headroom
    const roundedMax = Math.ceil((rawMax * 1.2) / 10) * 10;

    const width = 800;
    const height = 240;
    const padX = 60;
    const padY = 30;
    const chartW = width - padX - 20;
    const chartH = height - padY - 30;

    const getX = (i: number) =>
      count === 1 ? padX + chartW / 2 : padX + (i / (count - 1)) * chartW;
    const getY = (val: number) =>
      padY + chartH - (Math.max(0, val) / roundedMax) * chartH;

    const bPts = bookedRevenue.map((val, i) => ({ x: getX(i), y: getY(val), val }));
    const cPts = collectedRevenue.map((val, i) => ({ x: getX(i), y: getY(val), val }));

    // Helper: generate smooth cubic Bézier spline
    function createSmoothPath(points: Array<{ x: number; y: number }>): string {
      if (points.length === 0) return "";
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
      if (points.length === 2)
        return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = i > 0 ? points[i - 1] : points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = i < points.length - 2 ? points[i + 2] : p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
      }
      return d;
    }

    const bLine = createSmoothPath(bPts);
    const cLine = createSmoothPath(cPts);

    const zeroY = padY + chartH;
    const bArea =
      bPts.length > 0
        ? `${bLine} L ${bPts[bPts.length - 1].x} ${zeroY} L ${bPts[0].x} ${zeroY} Z`
        : "";
    const cArea =
      cPts.length > 0
        ? `${cLine} L ${cPts[cPts.length - 1].x} ${zeroY} L ${cPts[0].x} ${zeroY} Z`
        : "";

    // 4 Y-axis ticks
    const ticks = [0, roundedMax * 0.33, roundedMax * 0.66, roundedMax].map((val) => ({
      val: Math.round(val),
      y: getY(val),
    }));

    return {
      pointsBooked: bPts,
      pointsCollected: cPts,
      pathBookedLine: bLine,
      pathBookedArea: bArea,
      pathCollectedLine: cLine,
      pathCollectedArea: cArea,
      yTicks: ticks,
      maxVal: roundedMax,
    };
  }, [dates, bookedRevenue, collectedRevenue]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!containerRef.current || dates.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    setMousePos({ x: clientX, y: clientY });

    // Map SVG coordinates to nearest point
    const svgX = (clientX / rect.width) * 800;
    let closestIdx = 0;
    let minDist = Infinity;
    pointsBooked.forEach((pt, i) => {
      const dist = Math.abs(pt.x - svgX);
      if (dist < minDist) {
        minDist = dist;
        closestIdx = i;
      }
    });
    setHoverIdx(closestIdx);
  };

  const handleMouseLeave = () => {
    setHoverIdx(null);
    setMousePos(null);
  };

  const currencySym = getCurrencySymbol(currency);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 800 250"
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "320px",
          display: "block",
          overflow: "visible",
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>
          <linearGradient id="bookedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.32" />
            <stop offset="85%" stopColor="#0284c7" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="collectedGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#c084fc" stopOpacity="0.25" />
            <stop offset="85%" stopColor="#7c3aed" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </linearGradient>
          <filter id="bookedGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#38bdf8" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Grid Lines & Y Ticks */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1="55"
              y1={t.y}
              x2="780"
              y2={t.y}
              stroke="rgba(255, 255, 255, 0.07)"
              strokeDasharray="4 4"
              strokeWidth="1"
            />
            <text
              x="50"
              y={t.y + 3}
              textAnchor="end"
              fill="#64748b"
              fontSize="10"
              fontFamily="monospace"
              fontWeight="500"
            >
              {currencySym}
              {t.val >= 1000 ? `${(t.val / 1000).toFixed(1)}k` : t.val}
            </text>
          </g>
        ))}

        {/* Area Fills with subtle fade-in */}
        {pathBookedArea && (
          <motion.path
            d={pathBookedArea}
            fill="url(#bookedGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          />
        )}
        {pathCollectedArea && (
          <motion.path
            d={pathCollectedArea}
            fill="url(#collectedGradient)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          />
        )}

        {/* Stroke Lines with animated path length */}
        {pathBookedLine && (
          <motion.path
            d={pathBookedLine}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            filter="url(#bookedGlow)"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        )}
        {pathCollectedLine && (
          <motion.path
            d={pathCollectedLine}
            fill="none"
            stroke="#c084fc"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 3"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: "easeOut" }}
          />
        )}

        {/* X Axis Labels */}
        {dates.map((dateStr, i) => {
          // Show every Nth label to prevent clutter on 30d or 90d
          const step = Math.ceil(dates.length / 8);
          if (i % step !== 0 && i !== dates.length - 1) return null;
          const pt = pointsBooked[i];
          if (!pt) return null;
          return (
            <text
              key={dateStr}
              x={pt.x}
              y="245"
              textAnchor="middle"
              fill="#64748b"
              fontSize="10"
              fontFamily="sans-serif"
              fontWeight="500"
            >
              {dateStr.slice(5)}
            </text>
          );
        })}

        {/* Active Cursor & Highlights */}
        {hoverIdx !== null && pointsBooked[hoverIdx] && (
          <g>
            <line
              x1={pointsBooked[hoverIdx].x}
              y1="25"
              x2={pointsBooked[hoverIdx].x}
              y2="230"
              stroke="rgba(255, 255, 255, 0.3)"
              strokeDasharray="3 3"
              strokeWidth="1.5"
            />
            {/* Booked Circle */}
            <circle
              cx={pointsBooked[hoverIdx].x}
              cy={pointsBooked[hoverIdx].y}
              r="5.5"
              fill="#0f172a"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />
            {/* Collected Circle */}
            {pointsCollected[hoverIdx] && (
              <circle
                cx={pointsCollected[hoverIdx].x}
                cy={pointsCollected[hoverIdx].y}
                r="5.5"
                fill="#0f172a"
                stroke="#c084fc"
                strokeWidth="2.5"
              />
            )}
          </g>
        )}
      </svg>

      {/* Dynamic Hover Tooltip Badge with Framer Motion AnimatePresence */}
      <AnimatePresence>
        {hoverIdx !== null && mousePos && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            style={{
              position: "absolute",
              top: `${Math.max(10, mousePos.y - 85)}px`,
              left: `${Math.min(
                (containerRef.current?.clientWidth || 500) - 190,
                Math.max(15, mousePos.x - 90)
              )}px`,
              pointerEvents: "none",
              backgroundColor: "rgba(11, 17, 27, 0.94)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 0 15px rgba(56, 189, 248, 0.15)",
              backdropFilter: "blur(12px)",
              borderRadius: "10px",
              padding: "8px 12px",
              fontSize: "12px",
              zIndex: 30,
              minWidth: "170px",
              transition: "top 60ms ease-out, left 60ms ease-out",
            }}
          >
            <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: "600", marginBottom: "4px" }}>
              {dates[hoverIdx]}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#7dd3fc" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#38bdf8" }} />
                Booked:
              </span>
              <span style={{ fontWeight: "700", color: "#f8fafc" }}>
                {formatCurrency((bookedRevenue[hoverIdx] || 0) * 100, currency)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", marginTop: "2px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", color: "#d8b4fe" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#c084fc" }} />
                Collected:
              </span>
              <span style={{ fontWeight: "700", color: "#f8fafc" }}>
                {formatCurrency((collectedRevenue[hoverIdx] || 0) * 100, currency)}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 2. APPOINTMENT STATUS BREAKDOWN DONUT CHART
// ==========================================

interface StatusDonutSvgChartProps {
  completed: number;
  confirmed: number;
  inProgress: number;
  cancelled: number;
  noShow: number;
  hold?: number;
}

export function StatusDonutSvgChart({
  completed,
  confirmed,
  inProgress,
  cancelled,
  noShow,
  hold = 0,
}: StatusDonutSvgChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const segments = useMemo(() => {
    const raw = [
      { key: "completed", label: "Completed", count: completed, color: "#10b981" },
      { key: "confirmed", label: "Confirmed", count: confirmed, color: "#38bdf8" },
      { key: "inProgress", label: "In Progress", count: inProgress, color: "#818cf8" },
      { key: "noShow", label: "No-Show", count: noShow, color: "#f59e0b" },
      { key: "cancelled", label: "Cancelled", count: cancelled, color: "#f43f5e" },
      { key: "hold", label: "On Hold", count: hold, color: "#94a3b8" },
    ].filter((s) => s.count > 0);

    const total = raw.reduce((sum, s) => sum + s.count, 0);
    const radius = 60;
    const circumference = 2 * Math.PI * radius;

    let accumulatedOffset = 0;
    const computed = raw.map((s) => {
      const pct = total > 0 ? s.count / total : 0;
      const strokeDash = pct * circumference;
      const strokeDashoffset = -accumulatedOffset;
      accumulatedOffset += strokeDash;

      return {
        ...s,
        pct: Math.round(pct * 100),
        strokeDasharray: `${strokeDash} ${circumference - strokeDash}`,
        strokeDashoffset,
      };
    });

    return { total, list: computed, circumference };
  }, [completed, confirmed, inProgress, cancelled, noShow, hold]);

  const completionPct =
    segments.total > 0
      ? Math.round((completed / segments.total) * 100)
      : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ position: "relative", width: "190px", height: "190px" }}>
        <svg viewBox="0 0 160 160" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
          {/* Base Track */}
          <circle
            cx="80"
            cy="80"
            r="60"
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="16"
          />

          {/* Slices */}
          {segments.list.map((seg, idx) => (
            <motion.circle
              key={seg.key}
              cx="80"
              cy="80"
              r="60"
              fill="none"
              stroke={seg.color}
              strokeWidth={hoveredKey === seg.key ? "20" : "16"}
              strokeDasharray={seg.strokeDasharray}
              strokeDashoffset={seg.strokeDashoffset}
              strokeLinecap="round"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{
                opacity: hoveredKey && hoveredKey !== seg.key ? 0.35 : 1,
                scale: 1,
              }}
              transition={{ duration: 0.45, delay: idx * 0.04 }}
              style={{
                cursor: "pointer",
                transition: "stroke-width 200ms ease, opacity 200ms ease",
              }}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
            />
          ))}
        </svg>

        {/* Center KPI Readout */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "28px", fontWeight: "800", color: "#f8fafc", lineHeight: "1" }}>
            {completionPct}%
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", fontWeight: "600" }}>
            Completed
          </div>
          <div style={{ fontSize: "10px", color: "#64748b", marginTop: "1px" }}>
            {segments.total} total
          </div>
        </div>
      </div>

      {/* Interactive Legend Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
          gap: "8px",
          width: "100%",
          marginTop: "16px",
        }}
      >
        {segments.list.map((seg) => (
          <div
            key={seg.key}
            onMouseEnter={() => setHoveredKey(seg.key)}
            onMouseLeave={() => setHoveredKey(null)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 8px",
              borderRadius: "8px",
              backgroundColor:
                hoveredKey === seg.key
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(255, 255, 255, 0.02)",
              border: `1px solid ${
                hoveredKey === seg.key ? seg.color : "rgba(255, 255, 255, 0.05)"
              }`,
              cursor: "pointer",
              transition: "all 150ms ease",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: seg.color,
                }}
              />
              <span style={{ fontSize: "11px", color: "#cbd5e1" }}>{seg.label}</span>
            </div>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#f8fafc" }}>
              {seg.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 3. BOOKING VOLUME & ATTENDANCE BAR CHART
// ==========================================

interface BookingVolumeSvgChartProps {
  dates: string[];
  bookingsCount: number[];
  completedCount?: number[];
  cancelledCount?: number[];
}

export function BookingVolumeSvgChart({
  dates,
  bookingsCount,
  completedCount = [],
  cancelledCount = [],
}: BookingVolumeSvgChartProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const maxVal = Math.max(...bookingsCount, 1);
  const roundedMax = Math.max(5, Math.ceil(maxVal * 1.15));

  const count = dates.length;
  const width = 800;
  const height = 180;
  const padX = 35;
  const padY = 20;
  const chartW = width - padX - 10;
  const chartH = height - padY - 25;

  const barWidth = Math.max(6, Math.min(22, (chartW / count) * 0.65));

  return (
    <div style={{ position: "relative", width: "100%", userSelect: "none" }}>
      <svg
        viewBox="0 0 800 180"
        style={{
          width: "100%",
          height: "auto",
          maxHeight: "240px",
          display: "block",
          overflow: "visible",
        }}
      >
        <defs>
          <linearGradient id="barCompletedGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="barCancelledGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fb7185" />
            <stop offset="100%" stopColor="#e11d48" />
          </linearGradient>
        </defs>

        {/* 3 Reference Grid Lines */}
        {[0, roundedMax * 0.5, roundedMax].map((val, idx) => {
          const y = padY + chartH - (val / roundedMax) * chartH;
          return (
            <g key={idx}>
              <line
                x1={padX}
                y1={y}
                x2="790"
                y2={y}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padX - 8}
                y={y + 3}
                textAnchor="end"
                fill="#64748b"
                fontSize="10"
                fontFamily="monospace"
              >
                {Math.round(val)}
              </text>
            </g>
          );
        })}

        {/* Render Bars */}
        {dates.map((dateStr, i) => {
          const total = bookingsCount[i] || 0;
          const completed = completedCount[i] || 0;
          const cancelled = cancelledCount[i] || 0;

          const xCenter = count === 1 ? padX + chartW / 2 : padX + (i / (count - 1)) * chartW;
          const x = xCenter - barWidth / 2;

          const totalH = (total / roundedMax) * chartH;
          const completedH = (completed / roundedMax) * chartH;
          const cancelledH = (cancelled / roundedMax) * chartH;

          const isHovered = hoverIdx === i;

          return (
            <g
              key={dateStr}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Background Hit Box */}
              <rect
                x={x - 4}
                y={padY}
                width={barWidth + 8}
                height={chartH + 10}
                fill="transparent"
              />

              {/* Total Height Muted Pillar */}
              <rect
                x={x}
                y={padY + chartH - totalH}
                width={barWidth}
                height={Math.max(2, totalH)}
                rx="3"
                fill={isHovered ? "rgba(56, 189, 248, 0.25)" : "rgba(255, 255, 255, 0.08)"}
              />

              {/* Completed Bar Portion */}
              {completedH > 0 && (
                <rect
                  x={x}
                  y={padY + chartH - completedH}
                  width={barWidth}
                  height={completedH}
                  rx="3"
                  fill="url(#barCompletedGrad)"
                  opacity={isHovered ? 1 : 0.88}
                />
              )}

              {/* Cancelled Top Cap */}
              {cancelledH > 0 && (
                <rect
                  x={x}
                  y={padY + chartH - totalH}
                  width={barWidth}
                  height={Math.min(cancelledH, totalH)}
                  rx="3"
                  fill="url(#barCancelledGrad)"
                  opacity={isHovered ? 1 : 0.8}
                />
              )}

              {/* X Axis Label */}
              {(count <= 14 || i % Math.ceil(count / 8) === 0) && (
                <text
                  x={xCenter}
                  y={height - 2}
                  textAnchor="middle"
                  fill="#64748b"
                  fontSize="9"
                >
                  {dateStr.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover Info Tooltip with Framer Motion AnimatePresence */}
      <AnimatePresence>
        {hoverIdx !== null && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "absolute",
              top: "-38px",
              left: "50%",
              transform: "translateX(-50%)",
              backgroundColor: "rgba(11, 17, 27, 0.95)",
              border: "1px solid rgba(56, 189, 248, 0.35)",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "11px",
              color: "#f8fafc",
              fontWeight: "600",
              pointerEvents: "none",
              display: "flex",
              gap: "10px",
              boxShadow: "0 6px 16px rgba(0, 0, 0, 0.5)",
              zIndex: 20,
            }}
          >
            <span>{dates[hoverIdx]}</span>
            <span style={{ color: "#38bdf8" }}>{bookingsCount[hoverIdx] || 0} total</span>
            <span style={{ color: "#34d399" }}>{completedCount[hoverIdx] || 0} completed</span>
            <span style={{ color: "#f43f5e" }}>{cancelledCount[hoverIdx] || 0} cancelled</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 4. CAPACITY & SHIFT UTILIZATION SPEEDOMETER GAUGE
// ==========================================

interface CapacityGaugeSvgChartProps {
  utilizationRate: number; // 0 - 100
  totalBookedHours: number;
  totalBookableHours: number;
}

export function CapacityGaugeSvgChart({
  utilizationRate,
  totalBookedHours,
  totalBookableHours,
}: CapacityGaugeSvgChartProps) {
  const pct = Math.min(100, Math.max(0, utilizationRate));

  // Semi-circle arc: radius = 70. Perimeter of half circle = PI * R ~ 219.9
  const radius = 70;
  const halfCircumference = Math.PI * radius;
  const strokeOffset = halfCircumference * (1 - pct / 100);

  // Status diagnosis
  const statusLabel =
    pct >= 85 ? "Near Maximum Capacity" : pct >= 65 ? "Optimal Utilization" : "Available Capacity";
  const statusColor = pct >= 85 ? "#f59e0b" : pct >= 65 ? "#10b981" : "#38bdf8";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
      <div style={{ position: "relative", width: "220px", height: "125px" }}>
        <svg viewBox="0 0 180 105" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#38bdf8" />
              <stop offset="60%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#f59e0b" />
            </linearGradient>
          </defs>

          {/* Background Arc */}
          <path
            d="M 20 95 A 70 70 0 0 1 160 95"
            fill="none"
            stroke="rgba(255, 255, 255, 0.07)"
            strokeWidth="16"
            strokeLinecap="round"
          />

          {/* Target Zone Notch (65% - 85%) */}
          <path
            d="M 20 95 A 70 70 0 0 1 160 95"
            fill="none"
            stroke="rgba(16, 185, 129, 0.15)"
            strokeWidth="20"
            strokeDasharray={`${halfCircumference * 0.2} ${halfCircumference * 0.8}`}
            strokeDashoffset={`-${halfCircumference * 0.65}`}
          />

          {/* Active Value Progress Arc */}
          <motion.path
            d="M 20 95 A 70 70 0 0 1 160 95"
            fill="none"
            stroke="url(#gaugeGradient)"
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={halfCircumference}
            initial={{ strokeDashoffset: halfCircumference }}
            animate={{ strokeDashoffset: strokeOffset }}
            transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
          />

          {/* Indicator Marks */}
          <text x="18" y="104" fill="#64748b" fontSize="9" fontWeight="600">
            0%
          </text>
          <text x="90" y="20" textAnchor="middle" fill="#64748b" fontSize="9" fontWeight="600">
            Target 75%
          </text>
          <text x="162" y="104" textAnchor="end" fill="#64748b" fontSize="9" fontWeight="600">
            100%
          </text>
        </svg>

        {/* Center Percentage KPI */}
        <div
          style={{
            position: "absolute",
            bottom: "0px",
            left: 0,
            right: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: "32px", fontWeight: "800", color: "#f8fafc", lineHeight: "1" }}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: "12px" }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            padding: "3px 10px",
            borderRadius: "9999px",
            backgroundColor: `${statusColor}18`,
            border: `1px solid ${statusColor}40`,
            color: statusColor,
            fontSize: "11px",
            fontWeight: "700",
          }}
        >
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              backgroundColor: statusColor,
            }}
          />
          {statusLabel}
        </div>
        <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "6px" }}>
          <strong style={{ color: "#f8fafc" }}>{totalBookedHours}h</strong> booked of{" "}
          <strong style={{ color: "#f8fafc" }}>{totalBookableHours}h</strong> provider shift capacity
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 5. HORIZONTAL PERFORMANCE DISTRIBUTION BARS
// ==========================================

interface DistributionItem {
  id: string;
  name: string;
  count: number;
  revenueCents: number;
  utilizationRate?: number;
}

export function PerformanceDistributionBars({
  items,
  currency,
  metricLabel = "bookings",
  showUtilization = false,
}: {
  items: DistributionItem[];
  currency: string;
  metricLabel?: string;
  showUtilization?: boolean;
}) {
  const maxRev = Math.max(...items.map((i) => i.revenueCents), 1);

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "24px 0", color: "#64748b", fontSize: "13px" }}>
        No performance records in this period.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%" }}>
      {items.map((item, idx) => {
        const pct = Math.round((item.revenueCents / maxRev) * 100);
        return (
          <div
            key={item.id}
            style={{
              padding: "10px 12px",
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "6px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    width: "20px",
                    height: "20px",
                    borderRadius: "6px",
                    backgroundColor: idx === 0 ? "rgba(245, 158, 11, 0.15)" : "rgba(255, 255, 255, 0.06)",
                    color: idx === 0 ? "#fbbf24" : "#94a3b8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "11px",
                    fontWeight: "700",
                  }}
                >
                  {idx + 1}
                </span>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#f1f5f9" }}>
                  {item.name}
                </span>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#38bdf8" }}>
                  {formatCurrency(item.revenueCents, currency)}
                </span>
                <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "8px" }}>
                  {item.count} {metricLabel}
                  {showUtilization && item.utilizationRate != null && (
                    <> • {item.utilizationRate}% shift util</>
                  )}
                </span>
              </div>
            </div>

            {/* Visual Proportion Bar */}
            <div
              style={{
                width: "100%",
                height: "5px",
                borderRadius: "3px",
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                overflow: "hidden",
              }}
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: idx * 0.04, ease: "easeOut" }}
                style={{
                  height: "100%",
                  borderRadius: "3px",
                  background:
                    idx === 0
                      ? "linear-gradient(90deg, #38bdf8, #818cf8)"
                      : "linear-gradient(90deg, rgba(56, 189, 248, 0.7), rgba(56, 189, 248, 0.3))",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
