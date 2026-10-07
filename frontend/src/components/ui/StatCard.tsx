'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import clsx from 'clsx';

export interface StatCardProps {
  icon: ReactNode;
  label?: string;
  title?: string;
  value: string | number;
  trend?: { direction: 'up' | 'down'; value: string };
  glowColor?: 'blue' | 'emerald' | 'amber' | 'purple' | 'red' | 'cyan';
  color?: 'blue' | 'emerald' | 'amber' | 'purple' | 'red' | 'cyan';
  className?: string;
}

const glowClasses: Record<string, string> = {
  blue: 'stat-glow-blue',
  emerald: 'stat-glow-emerald',
  amber: 'stat-glow-amber',
  purple: 'stat-glow-purple',
  red: 'stat-glow-red',
  cyan: 'stat-glow-cyan',
};

const iconBgClasses: Record<string, string> = {
  blue: 'bg-[rgba(59,130,246,0.15)] text-[#3b82f6]',
  emerald: 'bg-[rgba(16,185,129,0.15)] text-[#10b981]',
  amber: 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b]',
  purple: 'bg-[rgba(139,92,246,0.15)] text-[#8b5cf6]',
  red: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]',
  cyan: 'bg-[rgba(6,182,212,0.15)] text-[#06b6d4]',
};

export const StatCard = ({
  icon,
  label,
  title,
  value,
  trend,
  glowColor,
  color,
  className,
}: StatCardProps) => {
  const displayLabel = label || title || '';
  const displayColor = glowColor || color || 'blue';
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20 }}
      whileHover={{ y: -3 }}
      className={clsx(
        'rounded-2xl border border-[rgba(59,130,246,0.15)] bg-gradient-to-br from-[rgba(26,31,46,0.8)] to-[rgba(17,24,39,0.6)] p-5 backdrop-blur-xl transition-shadow duration-300',
        glowClasses[displayColor],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        {/* Icon */}
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            iconBgClasses[displayColor],
          )}
        >
          {icon}
        </div>

        {/* Trend */}
        {trend && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              trend.direction === 'up'
                ? 'bg-[rgba(16,185,129,0.15)] text-[#10b981]'
                : 'bg-[rgba(239,68,68,0.15)] text-[#ef4444]',
            )}
          >
            {trend.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </span>
        )}
      </div>

      {/* Value */}
      <p className="mt-4 text-2xl font-bold text-gray-100">{value}</p>

      {/* Label */}
      <p className="mt-1 text-sm text-gray-400">{displayLabel}</p>
    </motion.div>
  );
};

export default StatCard;
