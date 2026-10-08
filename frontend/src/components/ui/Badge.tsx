import clsx from 'clsx';
import type { ReactNode } from 'react';

/* ---------- Priority badges ---------- */
const priorityStyles = {
  LOW: 'bg-[rgba(16,185,129,0.15)] text-[#10b981] border-[rgba(16,185,129,0.3)]',
  MEDIUM: 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]',
  HIGH: 'bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.3)]',
  CRITICAL: 'bg-[rgba(239,68,68,0.25)] text-[#fca5a5] border-[rgba(239,68,68,0.4)]',
};

/* ---------- SLA badges ---------- */
const slaStyles = {
  GREEN: 'bg-[rgba(16,185,129,0.15)] text-[#10b981] border-[rgba(16,185,129,0.3)]',
  YELLOW: 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]',
  ORANGE: 'bg-[rgba(249,115,22,0.15)] text-[#f97316] border-[rgba(249,115,22,0.3)]',
  RED: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] border-[rgba(239,68,68,0.3)]',
  BLACK: 'bg-[rgba(239,68,68,0.3)] text-[#fca5a5] border-[rgba(239,68,68,0.5)]',
};

/* ---------- Generic variants ---------- */
const genericStyles = {
  default: 'bg-[rgba(59,130,246,0.15)] text-[#3b82f6] border-[rgba(59,130,246,0.3)]',
  success: 'bg-[rgba(16,185,129,0.15)] text-[#10b981] border-[rgba(16,185,129,0.3)]',
  warning: 'bg-[rgba(245,158,11,0.15)] text-[#f59e0b] border-[rgba(245,158,11,0.3)]',
  danger: 'bg-[rgba(239,68,68,0.15)] text-[#ef4444] border-[rgba(239,68,68,0.3)]',
  info: 'bg-[rgba(6,182,212,0.15)] text-[#06b6d4] border-[rgba(6,182,212,0.3)]',
  purple: 'bg-[rgba(139,92,246,0.15)] text-[#8b5cf6] border-[rgba(139,92,246,0.3)]',
  neutral: 'bg-[rgba(148,163,184,0.1)] text-[#94a3b8] border-[rgba(148,163,184,0.2)]',
};

/* ---------- Size ---------- */
const sizeStyles = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
  lg: 'px-3 py-1.5 text-sm',
};

/* ---------- Shared base ---------- */
type BadgeBase = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
  dot?: boolean;
};

type PriorityBadgeProps = BadgeBase & { type: 'priority'; value: keyof typeof priorityStyles };
type SlaBadgeProps = BadgeBase & { type: 'sla'; value: keyof typeof slaStyles };
type GenericBadgeProps = BadgeBase & { type?: 'generic'; variant?: keyof typeof genericStyles };

export type BadgeProps = PriorityBadgeProps | SlaBadgeProps | GenericBadgeProps;

export const Badge = (props: BadgeProps) => {
  const { className, size = 'md', children, dot } = props;

  let colorClass: string;
  let label: ReactNode = children;

  if (props.type === 'priority') {
    colorClass = priorityStyles[props.value];
    label = label ?? props.value;
  } else if (props.type === 'sla') {
    colorClass = slaStyles[props.value];
    label = label ?? props.value;
  } else {
    const v = (props as GenericBadgeProps).variant ?? 'default';
    colorClass = genericStyles[v];
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-full border font-medium leading-none whitespace-nowrap',
        sizeStyles[size],
        colorClass,
        className,
      )}
    >
      {dot && (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      )}
      {label}
    </span>
  );
};

export default Badge;
