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
  blue: 'bg-[rgba(79,143,247,0.1)] text-[var(--accent-blue)]',
  emerald: 'bg-[rgba(52,211,153,0.1)] text-[var(--accent-emerald)]',
  amber: 'bg-[rgba(251,191,36,0.1)] text-[var(--accent-amber)]',
  purple: 'bg-[rgba(167,139,250,0.1)] text-[var(--accent-purple)]',
  red: 'bg-[rgba(248,113,113,0.1)] text-[var(--accent-red)]',
  cyan: 'bg-[rgba(34,211,238,0.1)] text-[var(--accent-cyan)]',
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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={clsx(
        'rounded-xl border border-[var(--border-primary)]',
        'bg-[var(--bg-card)]',
        'p-5 relative',
        glowClasses[displayColor],
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div
          className={clsx(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            iconBgClasses[displayColor],
          )}
        >
          {icon}
        </div>
        {trend && (
          <span
            className={clsx(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
              trend.direction === 'up'
                ? 'bg-[rgba(52,211,153,0.1)] text-[var(--accent-emerald)]'
                : 'bg-[rgba(248,113,113,0.1)] text-[var(--accent-red)]',
            )}
          >
            {trend.direction === 'up' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend.value}
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--text-primary)] tracking-tight">
        <AnimatedNumber value={value} />
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{displayLabel}</p>
    </motion.div>
  );
};

export default StatCard;
