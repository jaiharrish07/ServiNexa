import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '../Modal';

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

// Mock lucide-react X icon
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => <svg data-testid="x-icon" {...props} />,
}));

describe('Modal', () => {
  it('renders children when open', () => {
    render(
      <Modal open onClose={() => {}}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.getByText('Modal content')).toBeInTheDocument();
  });

  it('does not render children when closed', () => {
    render(
      <Modal open={false} onClose={() => {}}>
        <p>Modal content</p>
      </Modal>,
    );
    expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
  });

  it('renders the title', () => {
    render(
      <Modal open onClose={() => {}} title="Confirm">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );
    // The close button contains the X icon
    const closeBtn = screen.getByTestId('x-icon').closest('button')!;
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
