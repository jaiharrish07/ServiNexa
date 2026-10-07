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
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={clsx(
        'flex flex-col items-center justify-center py-16 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgba(59,130,246,0.1)] text-[#3b82f6]">
        {icon}
      </div>

      <h3 className="text-lg font-semibold text-gray-200">{title}</h3>

      {description && (
        <p className="mt-2 max-w-md text-sm text-gray-400">{description}</p>
      )}

      {action && (
        <div className="mt-6">
          {typeof action === 'object' && action !== null && 'label' in action ? (
            <button
              onClick={(action as { label: string; onClick: () => void }).onClick}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#3b82f6] to-[#8b5cf6] px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-shadow hover:shadow-[0_0_30px_rgba(59,130,246,0.5)]"
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
