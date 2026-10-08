'use client';

import { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode | { label: string; onClick: () => void };
  className?: string;
}

export const EmptyState = ({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={clsx(
        'flex flex-col items-center justify-center py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[rgba(79,143,247,0.08)] text-[var(--accent-blue)]">
        {icon}
      </div>

      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>

      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-[var(--text-muted)]">{description}</p>
      )}

      {action && (
        <div className="mt-5">
          {typeof action === 'object' && action !== null && 'label' in action ? (
            <button
              onClick={(action as { label: string; onClick: () => void }).onClick}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white transition-all duration-150 hover:brightness-110"
            >
              {(action as { label: string; onClick: () => void }).label}
            </button>
          ) : (
            action as ReactNode
          )}
        </div>
      )}
    </motion.div>
  );
};

export default EmptyState;
