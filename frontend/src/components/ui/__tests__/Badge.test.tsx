import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders with success variant', () => {
    render(<Badge variant="success">OK</Badge>);
    const badge = screen.getByText('OK');
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain('text-[#10b981]');
  });

  it('renders with warning variant', () => {
    render(<Badge variant="warning">Warn</Badge>);
    const badge = screen.getByText('Warn');
    expect(badge.className).toContain('text-[#f59e0b]');
  });

  it('renders with danger variant', () => {
    render(<Badge variant="danger">Error</Badge>);
    const badge = screen.getByText('Error');
    expect(badge.className).toContain('text-[#ef4444]');
  });

  it('renders with info variant', () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText('Info');
    expect(badge.className).toContain('text-[#06b6d4]');
  });

  it('renders priority badge with value as label', () => {
    render(<Badge type="priority" value="HIGH" />);
    expect(screen.getByText('HIGH')).toBeInTheDocument();
  });

  it('renders a dot when dot prop is true', () => {
    const { container } = render(<Badge dot>Status</Badge>);
    const dots = container.querySelectorAll('.rounded-full.bg-current');
    expect(dots.length).toBe(1);
  });
});
