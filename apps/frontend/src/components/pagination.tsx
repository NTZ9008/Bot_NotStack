import { useEffect, useState } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { tr } from '@/lib/i18n';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// แถบเปลี่ยนหน้ามาตรฐานของทุกรายการ — อยู่ใต้รายการเสมอ: ซ้าย "แสดง x–y จาก N" · ขวา [« ‹ หน้า p / P › »]
// hasMore = ยังมีหน้าถัดไปที่ยังไม่ได้โหลด (API แบบ cursor ไม่รู้จำนวนหน้าทั้งหมด → แสดง "P+" และซ่อนปุ่มหน้าสุดท้าย)
export function Pagination({
    page,
    pageCount,
    onPageChange,
    hasMore = false,
    total,
    pageSize,
    busy = false,
    className,
}: {
    page: number;
    pageCount: number;
    onPageChange: (page: number) => void;
    hasMore?: boolean;
    total?: number;
    pageSize?: number;
    busy?: boolean;
    className?: string;
}) {
    if (pageCount <= 1 && !hasMore) return null;
    const canPrev = page > 1 && !busy;
    const canNext = (page < pageCount || hasMore) && !busy;
    const range =
        total !== undefined && pageSize
            ? tr('common.showingRange', {
                  0: ((page - 1) * pageSize + 1).toLocaleString(),
                  1: Math.min(page * pageSize, total).toLocaleString(),
                  2: total.toLocaleString(),
              })
            : null;
    return (
        <nav aria-label={tr('common.pagination')} className={cn('flex flex-wrap items-center justify-between gap-2 text-sm', className)}>
            <p className="text-muted-foreground">{range}</p>
            <div className="ms-auto flex items-center gap-1">
                <Button variant="outline" size="icon-sm" aria-label={tr('common.firstPage')} disabled={!canPrev} onClick={() => onPageChange(1)}>
                    <ChevronsLeft />
                </Button>
                <Button variant="outline" size="icon-sm" aria-label={tr('common.previousPage')} disabled={!canPrev} onClick={() => onPageChange(page - 1)}>
                    <ChevronLeft />
                </Button>
                <span aria-live="polite" className="min-w-24 px-2 text-center tabular-nums">
                    {busy ? (
                        <Spinner className="mx-auto size-4" />
                    ) : (
                        tr('common.pageOf', { 0: page.toLocaleString(), 1: `${pageCount.toLocaleString()}${hasMore ? '+' : ''}` })
                    )}
                </span>
                <Button variant="outline" size="icon-sm" aria-label={tr('common.nextPage')} disabled={!canNext} onClick={() => onPageChange(page + 1)}>
                    <ChevronRight />
                </Button>
                {!hasMore && (
                    <Button variant="outline" size="icon-sm" aria-label={tr('common.lastPage')} disabled={!canNext} onClick={() => onPageChange(pageCount)}>
                        <ChevronsRight />
                    </Button>
                )}
            </div>
        </nav>
    );
}

export const PAGE_SIZE = 20;

export interface MorePages {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    fetchNextPage: () => Promise<unknown>;
}

// แบ่งหน้ารายการที่อยู่ในเครื่องแล้ว; ถ้าส่ง more (useInfiniteQuery) มา กดถัดไปที่หน้าสุดท้ายจะโหลดหน้าต่อจาก API ให้เอง
// เปลี่ยน resetKey (เช่นคำค้น/ตัวกรอง) → กลับไปหน้า 1
export function usePagedItems<T>(items: T[], { pageSize = PAGE_SIZE, more, resetKey }: { pageSize?: number; more?: MorePages; resetKey?: unknown } = {}) {
    const [state, setState] = useState({ page: 1, resetKey });
    let page = state.page;
    if (!Object.is(state.resetKey, resetKey)) {
        page = 1;
        setState({ page, resetKey });
    }
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    page = Math.min(page, pageCount);
    const hasMore = Boolean(more?.hasNextPage);
    // อยู่หน้าสุดท้ายที่โหลดไว้ → โหลดหน้าถัดไปล่วงหน้า ให้หน้านี้เต็มก่อนกด "ถัดไป" (ไม่ข้ามแถวที่ยังไม่เห็น)
    const prefetch = page === pageCount && hasMore && !more?.isFetchingNextPage;
    const fetchNext = more?.fetchNextPage;
    useEffect(() => {
        if (prefetch) void fetchNext?.();
    }, [prefetch, fetchNext]);
    const setPage = (next: number) => {
        if (next > pageCount && more?.hasNextPage) {
            void more.fetchNextPage().then(() => setState((s) => ({ ...s, page: next })));
            return;
        }
        setState((s) => ({ ...s, page: next }));
    };
    return {
        pageItems: items.slice((page - 1) * pageSize, page * pageSize),
        pagination: {
            page,
            pageCount,
            hasMore,
            onPageChange: setPage,
            busy: Boolean(more?.isFetchingNextPage),
            ...(hasMore ? {} : { total: items.length, pageSize }),
        },
    };
}
