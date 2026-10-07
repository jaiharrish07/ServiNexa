'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface CardProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'blue' | 'purple' | 'emerald' | 'amber' | 'red' | 'cyan';
  hoverable?: boolean;
  onClick?: () => void;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const glowMap: Record<string, string> = {
  blue: 'hover:shadow-[0_4px_40px_-8px_rgba(79,143,247,0.18)] hover:border-[rgba(79,143,247,0.3)]',
  purple: 'hover:shadow-[0_4px_40px_-8px_rgba(167,139,250,0.18)] hover:border-[rgba(167,139,250,0.3)]',
  emerald: 'hover:shadow-[0_4px_40px_-8px_rgba(52,211,153,0.18)] hover:border-[rgba(52,211,153,0.3)]',
  amber: 'hover:shadow-[0_4px_40px_-8px_rgba(251,191,36,0.18)] hover:border-[rgba(251,191,36,0.3)]',
  red: 'hover:shadow-[0_4px_40px_-8px_rgba(248,113,113,0.18)] hover:border-[rgba(248,113,113,0.3)]',
  cyan: 'hover:shadow-[0_4px_40px_-8px_rgba(34,211,238,0.18)] hover:border-[rgba(34,211,238,0.3)]',
};

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export const Card = ({
  children,
  className,
  glowColor = 'blue',
  hoverable = true,
  onClick,
  padding = 'md',
}: CardProps) => {
  return (
    <motion.div
      whileHover={hoverable ? { y: -2 } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      onClick={onClick}
      className={clsx(
        'rounded-2xl border border-[var(--border-primary)]',
        'bg-[var(--bg-card)] backdrop-blur-2xl',
        'transition-all duration-300 relative overflow-hidden',
        paddingMap[padding],
        hoverable && glowMap[glowColor],
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {/* Noise texture overlay */}
      <div className="absolute inset-0 rounded-2xl opacity-[0.03] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
      }} />
      {/* Top highlight line */}
      <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <div className="relative z-[1]">{children}</div>
    </motion.div>
  );
};

export default Card;
