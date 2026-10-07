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
    if (sortKey !== col || !sortDir) return <ChevronsUpDown size={14} className="text-gray-500" />;
    return sortDir === 'asc' ? (
      <ChevronUp size={14} className="text-[#3b82f6]" />
    ) : (
      <ChevronDown size={14} className="text-[#3b82f6]" />
    );
  };

  const alignClass = (align?: string) =>
    align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left';

  return (
    <div
      className={clsx(
        'overflow-x-auto rounded-2xl border border-[rgba(59,130,246,0.15)] bg-gradient-to-br from-[rgba(26,31,46,0.8)] to-[rgba(17,24,39,0.6)] backdrop-blur-xl',
        className,
      )}
    >
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[rgba(59,130,246,0.12)]">
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'px-4 py-3 font-medium text-gray-400 whitespace-nowrap',
                  col.width,
                  alignClass(col.align),
                  col.sortable && 'cursor-pointer select-none hover:text-gray-200 transition-colors',
                )}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className="inline-flex items-center gap-1.5">
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
                className="px-4 py-12 text-center text-gray-500"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={clsx(
                  'border-b border-[rgba(59,130,246,0.06)] transition-colors',
                  i % 2 === 0 ? 'bg-transparent' : 'bg-[rgba(255,255,255,0.02)]',
                  'hover:bg-[rgba(59,130,246,0.08)]',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 text-gray-200 whitespace-nowrap',
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
