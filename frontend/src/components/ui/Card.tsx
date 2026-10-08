'use client';

import { type ReactNode } from 'react';
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
  blue: 'hover:border-[rgba(79,143,247,0.25)]',
  purple: 'hover:border-[rgba(167,139,250,0.25)]',
  emerald: 'hover:border-[rgba(52,211,153,0.25)]',
  amber: 'hover:border-[rgba(251,191,36,0.25)]',
  red: 'hover:border-[rgba(248,113,113,0.25)]',
  cyan: 'hover:border-[rgba(34,211,238,0.25)]',
};

const paddingMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
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
    <div
      onClick={onClick}
      className={clsx(
        'rounded-xl border border-[var(--border-primary)]',
        'bg-[var(--bg-card)]',
        'transition-colors duration-150 relative',
        paddingMap[padding],
        hoverable && glowMap[glowColor],
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
};

export default Card;
