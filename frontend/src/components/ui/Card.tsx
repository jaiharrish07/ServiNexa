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
  blue: 'hover:shadow-[0_0_30px_rgba(59,130,246,0.12)] hover:border-[rgba(59,130,246,0.35)]',
  purple: 'hover:shadow-[0_0_30px_rgba(139,92,246,0.12)] hover:border-[rgba(139,92,246,0.35)]',
  emerald: 'hover:shadow-[0_0_30px_rgba(16,185,129,0.12)] hover:border-[rgba(16,185,129,0.35)]',
  amber: 'hover:shadow-[0_0_30px_rgba(245,158,11,0.12)] hover:border-[rgba(245,158,11,0.35)]',
  red: 'hover:shadow-[0_0_30px_rgba(239,68,68,0.12)] hover:border-[rgba(239,68,68,0.35)]',
  cyan: 'hover:shadow-[0_0_30px_rgba(6,182,212,0.12)] hover:border-[rgba(6,182,212,0.35)]',
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
        'rounded-2xl border border-[rgba(59,130,246,0.15)] bg-gradient-to-br from-[rgba(26,31,46,0.8)] to-[rgba(17,24,39,0.6)] backdrop-blur-xl transition-all duration-300',
        paddingMap[padding],
        hoverable && glowMap[glowColor],
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </motion.div>
  );
};

export default Card;
