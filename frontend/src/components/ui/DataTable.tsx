'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import clsx from 'clsx';

/* ---------- Types ---------- */

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  /** Custom cell renderer */
  render?: (row: T) => ReactNode;
  /** Width class, e.g. 'w-40' */
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key accessor per row */
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  className?: string;
}

type SortDir = 'asc' | 'desc' | null;

/* ---------- Component ---------- */

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  onRowClick,
  emptyMessage = 'No data available',
  className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : prev === 'desc' ? null : 'asc'));
      if (sortDir === 'desc') setSortKey(null);
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: string }) => {
    if (sortKey !== col || !sortDir) return <ChevronsUpDown size={13} className="text-[var(--text-muted)]" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={13} className="text-[var(--accent-blue)]" />
    ) : (
      <ChevronDown size={13} className="text-[var(--accent-blue)]" />
    );
  };

  const alignClass = (align?: string) =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div
      className={clsx(
        'overflow-x-auto rounded-xl border border-[var(--border-primary)] bg-[var(--bg-card)]',
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--bg-secondary)]">
          <tr className="border-b border-[var(--border-primary)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] whitespace-nowrap',
                  col.width,
                  alignClass(col.align),
                  col.sortable && 'cursor-pointer select-none hover:text-[var(--text-secondary)] transition-colors duration-150',
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && <SortIcon col={col.key} />}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-[var(--text-muted)]"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'border-b border-[var(--border-subtle)] transition-colors duration-100',
                  'hover:bg-[var(--bg-card-hover)]',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-2.5 text-[var(--text-primary)] whitespace-nowrap',
                      col.width,
                      alignClass(col.align),
                    )}
                  >
                    {col.render ? col.render(row) : (row[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default DataTable;
