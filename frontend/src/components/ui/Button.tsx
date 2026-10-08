'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const variantStyles = {
  primary:
    'bg-gradient-to-r from-[#3b82f6] to-[#6d5de6] text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_12px_rgba(59,130,246,0.15)] hover:brightness-110',
  secondary:
    'bg-[var(--bg-elevated)] border border-[var(--border-primary)] text-[var(--text-primary)] hover:border-[rgba(59,130,246,0.3)] hover:bg-[var(--bg-card-hover)]',
  danger:
    'bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white shadow-[0_1px_2px_rgba(0,0,0,0.3),0_0_12px_rgba(239,68,68,0.15)] hover:brightness-110',
  ghost:
    'bg-transparent text-[var(--text-secondary)] hover:bg-[rgba(59,130,246,0.08)] hover:text-[var(--text-primary)]',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3 text-base rounded-lg gap-2.5',
};

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onAnimationStart' | 'onDrag' | 'onDragEnd' | 'onDragStart' | 'style'> {
  variant?: keyof typeof variantStyles;
  size?: keyof typeof sizeStyles;
  loading?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      disabled = false,
      icon,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    return (
      <motion.button
        ref={ref}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.1 }}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center font-medium transition-all duration-150 cursor-pointer select-none',
          variantStyles[variant],
          sizeStyles[size],
          isDisabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
        {...(props as HTMLMotionProps<'button'>)}
      >
        {loading ? (
          <Loader2 className="animate-spin" size={size === 'sm' ? 14 : size === 'lg' ? 20 : 16} />
        ) : icon ? (
          <span className="flex-shrink-0">{icon}</span>
        ) : null}
        {children}
      </motion.button>
    );
  },
);

Button.displayName = 'Button';
export default Button;
