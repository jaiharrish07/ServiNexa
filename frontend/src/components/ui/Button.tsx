'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

const variantStyles = {
  primary:
    'bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]',
  secondary:
    'bg-[rgba(26,31,46,0.8)] backdrop-blur-xl border border-[rgba(59,130,246,0.2)] text-gray-100 hover:border-[rgba(59,130,246,0.4)] hover:bg-[rgba(34,40,64,0.9)]',
  danger:
    'bg-gradient-to-r from-[#ef4444] to-[#dc2626] text-white shadow-[0_0_20px_rgba(239,68,68,0.3)] hover:shadow-[0_0_30px_rgba(239,68,68,0.5)]',
  ghost:
    'bg-transparent text-gray-300 hover:bg-[rgba(59,130,246,0.1)] hover:text-white',
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm rounded-lg gap-1.5',
  md: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-7 py-3.5 text-base rounded-xl gap-2.5',
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
        whileHover={isDisabled ? undefined : { scale: 1.03 }}
        whileTap={isDisabled ? undefined : { scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        disabled={isDisabled}
        className={clsx(
          'inline-flex items-center justify-center font-medium transition-all duration-200 cursor-pointer select-none',
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
