"use client";

import React, { useState, useRef } from "react";
import {
  motion,
  AnimatePresence,
  HTMLMotionProps,
  Transition,
  Variants,
} from "framer-motion";

// ==========================================
// 1. TRANSITION PANEL (Motion-Primitives standard)
// Smoothly morphs and transitions between active panels/steps
// ==========================================
export interface TransitionPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  activeIndex: number;
  children: React.ReactNode[];
  direction?: 1 | -1;
  transition?: Transition;
  variants?: Variants;
}

const defaultPanelVariants: Variants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 32 : -32,
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 32 : -32,
    opacity: 0,
    filter: "blur(4px)",
  }),
};

export function TransitionPanel({
  activeIndex,
  children,
  direction = 1,
  className,
  transition = { type: "spring", stiffness: 350, damping: 30 },
  variants = defaultPanelVariants,
  style,
  ...props
}: TransitionPanelProps) {
  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
      {...props}
    >
      <AnimatePresence initial={false} custom={direction} mode="wait">
        <motion.div
          key={activeIndex}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={transition}
          style={{ width: "100%" }}
        >
          {children[activeIndex]}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// 2. ANIMATED GROUP (Staggered Children Reveal)
// ==========================================
export interface AnimatedGroupProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
  style?: React.CSSProperties;
}

export function AnimatedGroup({
  children,
  className,
  delay = 0,
  stagger = 0.06,
  style,
}: AnimatedGroupProps) {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: delay,
        staggerChildren: stagger,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 12, filter: "blur(2px)" },
    visible: {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 28,
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={className}
      style={style}
    >
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        return (
          <motion.div variants={itemVariants}>
            {child}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ==========================================
// 3. SPOTLIGHT CARD
// Interactive card with cursor-tracking radial glow and spring hover
// ==========================================
export interface SpotlightCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  spotlightColor?: string;
  className?: string;
}

export function SpotlightCard({
  children,
  spotlightColor = "rgba(56, 189, 248, 0.12)",
  className,
  style,
  ...props
}: SpotlightCardProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: -1000, y: -1000 });
  const [opacity, setOpacity] = useState(0);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!divRef.current) return;
    const rect = divRef.current.getBoundingClientRect();
    setPosition({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setOpacity(1);
  };

  const handleMouseLeave = () => {
    setOpacity(0);
  };

  return (
    <motion.div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: "16px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        background: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(20px)",
        ...style,
      }}
      className={className}
      {...props}
    >
      {/* Radial Spotlight Overlay */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          opacity,
          transition: "opacity 0.25s ease",
          background: `radial-gradient(400px circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 70%)`,
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </motion.div>
  );
}

// ==========================================
// 4. PROGRESSIVE DISCLOSURE / COLLAPSIBLE
// Clean visual limits with "See More" / "Show Less" without breaking logic
// ==========================================
export interface CollapsibleDisclosureProps {
  children: React.ReactNode;
  isOpen: boolean;
  maxCollapsedHeight?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function CollapsibleDisclosure({
  children,
  isOpen,
  maxCollapsedHeight = 0,
  className,
  style,
}: CollapsibleDisclosureProps) {
  return (
    <motion.div
      initial={false}
      animate={{
        height: isOpen ? "auto" : maxCollapsedHeight,
        opacity: isOpen || maxCollapsedHeight > 0 ? 1 : 0,
      }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
      style={{
        overflow: "hidden",
        ...style,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ==========================================
// 5. MOTION ALERT / NOTIFICATION
// Animated entrance with subtle shake for error states
// ==========================================
export interface MotionAlertProps {
  children: React.ReactNode;
  isVisible: boolean;
  type?: "error" | "success" | "info" | "warning";
  className?: string;
}

export function MotionAlert({
  children,
  isVisible,
  type = "info",
  className,
}: MotionAlertProps) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98, filter: "blur(2px)" }}
          animate={{
            opacity: 1,
            y: 0,
            scale: 1,
            filter: "blur(0px)",
            x: type === "error" ? [0, -4, 4, -2, 2, 0] : 0,
          }}
          exit={{ opacity: 0, y: -6, scale: 0.97, filter: "blur(2px)" }}
          transition={{
            duration: 0.22,
            ease: "easeOut",
            x: { duration: 0.35, ease: "easeInOut" },
          }}
          className={className}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
