import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * ตารางกลางของทั้งระบบ (TanStack Table + shadcn Table)
 * - คลิกหัวคอลัมน์ที่ enableSorting เพื่อเรียง
 * - globalFilter = ข้อความค้นหาที่กรองทุกคอลัมน์
 */
export function DataTable<TData>({
    columns,
    data,
    empty = 'ไม่มีข้อมูล',
    globalFilter,
    rowClassName,
    className,
}: {
    columns: ColumnDef<TData, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
    data: TData[];
    empty?: ReactNode;
    globalFilter?: string;
    rowClassName?: (row: TData) => string | undefined;
    className?: string;
}) {
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

    return (
        <div className={cn('overflow-hidden rounded-lg border', className)}>
            <Table>
                <TableHeader className="bg-muted/40">
                    {table.getHeaderGroups().map((headerGroup) => (
                        <TableRow key={headerGroup.id} className="hover:bg-transparent">
                            {headerGroup.headers.map((header) => {
                                const sorted = header.column.getIsSorted();
                                return (
                                    <TableHead key={header.id} className="text-xs tracking-wide text-muted-foreground uppercase">
                                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                                            <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={header.column.getToggleSortingHandler()}>
                                                {flexRender(header.column.columnDef.header, header.getContext())}
                                                {sorted === 'asc' ? <ArrowUp className="size-3" /> : sorted === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUpDown className="size-3 opacity-40" />}
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
                    {table.getRowModel().rows.length ? (
                        table.getRowModel().rows.map((row) => (
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
    );
}
