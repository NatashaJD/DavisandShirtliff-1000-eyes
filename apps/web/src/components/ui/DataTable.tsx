import { cn } from '@/lib/utils';

interface Column<T> {
  key: string; header: string; className?: string; render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string;
  onRowClick?: (row: T) => void; loading?: boolean; emptyMessage?: string;
}

export function DataTable<T>({ columns, rows, rowKey, onRowClick, loading, emptyMessage = 'No data' }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded border" style={{ background: '#ffffff', borderColor: '#c8dff5', boxShadow: '0 1px 4px rgba(0,102,204,0.07)' }}>
      <table className="w-full border-collapse text-[0.82rem]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={cn('border-b px-4 py-2.5 text-left text-[0.68rem] font-semibold uppercase tracking-wider whitespace-nowrap', c.className)}
                style={{ background: '#f7fbff', borderColor: '#c8dff5', color: '#5a8fc4' }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm" style={{ color: '#5a8fc4' }}>Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-10 text-center text-sm" style={{ color: '#5a8fc4' }}>{emptyMessage}</td></tr>
          ) : rows.map((row) => (
            <tr key={rowKey(row)} onClick={() => onRowClick?.(row)}
              className={cn('border-b last:border-0 transition', onRowClick && 'cursor-pointer')}
              style={{ borderColor: '#e6f0fb' }}
              onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = '#f0f6ff')}
              onMouseLeave={(e) => onRowClick && (e.currentTarget.style.background = 'transparent')}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>{c.render(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
