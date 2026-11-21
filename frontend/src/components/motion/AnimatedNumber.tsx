"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

/**
 * Smooth 60fps Framer Motion numeric counter rendered in monospace tabular numerals.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  duration = 0.85,
  className = "",
}: AnimatedNumberProps) {
  const motionVal = useMotionValue(0);

  const formatted = useTransform(motionVal, (latest) => {
    const safeVal = Number.isFinite(latest) ? latest : 0;
    const formattedNumber = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(safeVal);
    return `${prefix}${formattedNumber}${suffix}`;
  });

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [motionVal, value, duration]);

  return (
    <motion.span className={`font-mono tabular-nums ${className}`}>
      {formatted}
    </motion.span>
  );
}
