'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
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
  blue: 'bg-[rgba(79,143,247,0.12)] text-[var(--accent-blue)] shadow-[0_0_20px_-4px_rgba(79,143,247,0.3)]',
  emerald: 'bg-[rgba(52,211,153,0.12)] text-[var(--accent-emerald)] shadow-[0_0_20px_-4px_rgba(52,211,153,0.3)]',
  amber: 'bg-[rgba(251,191,36,0.12)] text-[var(--accent-amber)] shadow-[0_0_20px_-4px_rgba(251,191,36,0.3)]',
  purple: 'bg-[rgba(167,139,250,0.12)] text-[var(--accent-purple)] shadow-[0_0_20px_-4px_rgba(167,139,250,0.3)]',
  red: 'bg-[rgba(248,113,113,0.12)] text-[var(--accent-red)] shadow-[0_0_20px_-4px_rgba(248,113,113,0.3)]',
  cyan: 'bg-[rgba(34,211,238,0.12)] text-[var(--accent-cyan)] shadow-[0_0_20px_-4px_rgba(34,211,238,0.3)]',
};

const accentColors: Record<string, string> = {
  blue: 'rgba(79,143,247,0.5)',
  emerald: 'rgba(52,211,153,0.5)',
  amber: 'rgba(251,191,36,0.5)',
  purple: 'rgba(167,139,250,0.5)',
  red: 'rgba(248,113,113,0.5)',
  cyan: 'rgba(34,211,238,0.5)',
};

function AnimatedNumber({ value }: { value: string | number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!inView) return;
    const strVal = String(value);
    const numericMatch = strVal.match(/^([\d.]+)/);
    if (!numericMatch) {
      setDisplay(strVal);
      return;
    }
    const target = parseFloat(numericMatch[1]);
    const suffix = strVal.slice(numericMatch[0].length);
    const isFloat = strVal.includes('.');
    const duration = 800;
    const start = performance.now();

    function animate(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = target * eased;
      setDisplay((isFloat ? current.toFixed(1) : Math.round(current).toString()) + suffix);
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }, [inView, value]);

  return <span ref={ref}>{display}</span>;
}

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
      whileHover={{ y: -4 }}
      className={clsx(
        'rounded-2xl border border-[var(--border-primary)]',
        'bg-[var(--bg-card)] backdrop-blur-2xl',
        'p-5 transition-all duration-300 relative overflow-hidden group',
        glowClasses[displayColor],
        className,
      )}
    >
      {/* Accent gradient orb in background */}
      <div
        className="absolute -top-8 -right-8 w-24 h-24 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: accentColors[displayColor] }}
      />
      {/* Top highlight */}
      <div className="absolute top-0 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />

      <div className="relative z-[1]">
        <div className="flex items-start justify-between">
          <div
            className={clsx(
              'flex h-11 w-11 items-center justify-center rounded-xl',
              iconBgClasses[displayColor],
            )}
          >
            {icon}
          </div>
          {trend && (
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
                trend.direction === 'up'
                  ? 'bg-[rgba(52,211,153,0.12)] text-[var(--accent-emerald)]'
                  : 'bg-[rgba(248,113,113,0.12)] text-[var(--accent-red)]',
              )}
            >
              {trend.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.value}
            </span>
          )}
        </div>
        <p className="mt-4 text-3xl font-bold text-[var(--text-primary)] tracking-tight">
          <AnimatedNumber value={value} />
        </p>
        <p className="mt-1.5 text-sm font-medium text-[var(--text-muted)]">{displayLabel}</p>
      </div>
    </motion.div>
  );
};

export default StatCard;
