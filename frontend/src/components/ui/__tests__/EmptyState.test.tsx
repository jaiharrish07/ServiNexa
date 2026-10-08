import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmptyState } from '../EmptyState';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { variants, initial, animate, exit, transition, whileHover, layout, ...htmlProps } = props;
      return <div {...htmlProps as React.HTMLAttributes<HTMLDivElement>}>{children}</div>;
    },
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState icon={<span>icon</span>} title="No items" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
  });

  it('renders the description when provided', () => {
    render(<EmptyState icon={<span>icon</span>} title="Empty" description="Nothing here yet" />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    render(<EmptyState icon={<span>icon</span>} title="Empty" />);
    expect(screen.queryByText('Nothing here yet')).not.toBeInTheDocument();
  });

  it('renders action button with label and fires onClick', () => {
    const handler = vi.fn();
    render(
      <EmptyState
        icon={<span>icon</span>}
        title="Empty"
        action={{ label: 'Add item', onClick: handler }}
      />,
    );
    const btn = screen.getByText('Add item');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledOnce();
  });
});
