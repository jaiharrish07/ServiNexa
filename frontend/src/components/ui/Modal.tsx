'use client';

import { type ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import clsx from 'clsx';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const panelVariants = {
  hidden: { opacity: 0, scale: 0.95, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
  exit: { opacity: 0, scale: 0.95, y: 20, transition: { duration: 0.15 } },
} satisfies Record<string, unknown>;

export const Modal = ({
  open,
  onClose,
  title,
  children,
  size = 'md',
  className,
}: ModalProps) => {
  /* Lock body scroll when open */
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-[rgba(0,0,0,0.6)] backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={clsx(
              'relative w-full rounded-2xl border border-[rgba(59,130,246,0.2)] bg-gradient-to-br from-[#1a1f2e] to-[#111827] p-6 shadow-[0_0_40px_rgba(59,130,246,0.1)]',
              sizeMap[size],
              className,
            )}
          >
            {/* Header */}
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-[rgba(59,130,246,0.1)] hover:text-gray-200"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            {/* Body */}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Modal;
