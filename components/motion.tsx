"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

interface MotionProps {
  children: ReactNode;
  className?: string;
}

/** Fades and lifts content in once when the page mounts. */
export function FadeIn({ children, className }: MotionProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}

/** Re-plays the entrance on every route change. */
export function PageTransition({ children, className }: MotionProps) {
  const pathname = usePathname();
  return (
    <FadeIn key={pathname} className={className}>
      {children}
    </FadeIn>
  );
}

/** Container that staggers the entrance of its `StaggerItem` children. */
export function Stagger({ children, className }: MotionProps) {
  const reduce = useReducedMotion();
  return (
    <motion.ul
      className={className}
      initial={reduce ? false : "hidden"}
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
    >
      {children}
    </motion.ul>
  );
}

export function StaggerItem({ children, className }: MotionProps) {
  return (
    <motion.li
      className={className}
      variants={{
        hidden: { opacity: 0, y: 6 },
        show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
      }}
    >
      {children}
    </motion.li>
  );
}
