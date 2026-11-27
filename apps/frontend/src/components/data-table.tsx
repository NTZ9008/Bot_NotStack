import { tr } from '../lib/i18n';
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from '@/components/icons';
import { useId, useState, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Pagination, usePagedItems, type MorePages } from '@/components/pagination';

/**
 * ตารางกลางของทั้งระบบ (TanStack Table + shadcn Table)
 * - คลิกหัวคอลัมน์ที่ enableSorting เพื่อเรียง
 * - globalFilter = ข้อความค้นหาที่กรองทุกคอลัมน์
 * - label = ชื่อตาราง (caption) — ทำให้กล่องเลื่อนแนวนอนกด Tab เข้าไปเลื่อนด้วยคีย์บอร์ดได้
 * - แบ่งหน้าเสมอ (pageSize แถว/หน้า, แถบเปลี่ยนหน้าซ่อนเองถ้ามีหน้าเดียว); more = useInfiniteQuery ที่โหลดหน้าต่อจาก API
 */
export function DataTable<TData>({
    columns,
    data,
    empty = tr('common.noData'),
    globalFilter,
    rowClassName,
    className,
    label,
    pageSize,
    more,
    paginate = true,
}: {
    columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    data: TData[];
    empty?: ReactNode;
    globalFilter?: string;
    rowClassName?: (row: TData) => string | undefined;
    className?: string;
    label?: string;
    pageSize?: number;
    more?: MorePages;
    // false = ข้อมูลแบ่งหน้ามาจาก API แล้ว (หน้าแม่วาง Pagination เอง)
    paginate?: boolean;
}) {
    const captionId = useId();
    const [sorting, setSorting] = useState<SortingState>([]);
    const table = useReactTable({
        data,
        columns,
        state: { sorting, globalFilter },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        enableSortingRemoval: true,
    });
    const allRows = table.getRowModel().rows;
    const { pageItems, pagination } = usePagedItems(allRows, { pageSize, more, resetKey: globalFilter });
    const rows = paginate ? pageItems : allRows;

    return (
        <div className="space-y-3">
            <div className={cn('overflow-hidden rounded-lg border', className)}>
                <Table
                    containerProps={
                        label
                            ? {
                                  tabIndex: 0,
                                  role: 'region',
                                  'aria-labelledby': captionId,
                                  className: 'outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset',
                              }
                            : undefined
                    }
                >
                    {label && (
                        <caption id={captionId} className="sr-only">
                            {label}
                        </caption>
                    )}
                    <TableHeader className="bg-muted/40">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id} className="hover:bg-transparent">
                                {headerGroup.headers.map((header) => {
                                    const sorted = header.column.getIsSorted();
                                    return (
                                        <TableHead
                                            key={header.id}
                                            scope="col"
                                            // only the sorted column carries aria-sort; never "none"
                                            aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : undefined}
                                            className="text-xs tracking-wide text-muted-foreground uppercase"
                                        >
                                            {header.isPlaceholder ? null : header.column.getCanSort() ? (
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 hover:text-foreground"
                                                    onClick={header.column.getToggleSortingHandler()}
                                                >
                                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                                    {sorted === 'asc' ? (
                                                        <ArrowUp className="size-3" />
                                                    ) : sorted === 'desc' ? (
                                                        <ArrowDown className="size-3" />
                                                    ) : (
                                                        <ArrowUpDown className="size-3 opacity-40" />
                                                    )}
                                                </button>
                                            ) : (
                                                flexRender(header.column.columnDef.header, header.getContext())
                                            )}
                                        </TableHead>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {rows.length ? (
                            rows.map((row) => (
                                <TableRow key={row.id} className={rowClassName?.(row.original)}>
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                                    ))}
                                </TableRow>
                            ))
                        ) : (
                            <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                    {empty}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
            {paginate && <Pagination {...pagination} />}
        </div>
    );
}
