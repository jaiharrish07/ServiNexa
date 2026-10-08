import clsx from 'clsx';

export interface LoadingSpinnerProps {
  /** 'page' renders a full-screen overlay; 'inline' fits within its container */
  mode?: 'page' | 'inline';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

const sizeMap = {
  sm: 'h-5 w-5 border-2',
  md: 'h-8 w-8 border-[3px]',
  lg: 'h-12 w-12 border-4',
};

export const LoadingSpinner = ({
  mode = 'inline',
  size = 'md',
  label,
  className,
}: LoadingSpinnerProps) => {
  const spinner = (
    <div className={clsx('flex flex-col items-center gap-3', className)}>
      <div
        className={clsx(
          'animate-spin rounded-full border-transparent',
          sizeMap[size],
        )}
        style={{
          borderTopColor: 'var(--accent-blue)',
          borderRightColor: 'var(--accent-purple)',
          borderBottomColor: 'transparent',
          borderLeftColor: 'transparent',
        }}
      />
      {label && <p className="text-sm text-[var(--text-muted)]">{label}</p>}
    </div>
  );

  if (mode === 'page') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,10,20,0.85)] backdrop-blur-sm">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default LoadingSpinner;
