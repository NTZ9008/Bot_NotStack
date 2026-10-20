// Keep the global pending UI independent of page editors, schemas and icon collections.
export function NavigationSkeleton() {
    return (
        <div role="status" aria-label="กำลังโหลดหน้า" className="space-y-4 motion-safe:animate-pulse">
            <div className="h-8 w-56 rounded-lg bg-muted" />
            <div className="h-4 w-80 max-w-full rounded bg-muted" />
            <div className="grid gap-4 md:grid-cols-2">
                <div className="h-64 rounded-xl border bg-muted/30" />
                <div className="h-64 rounded-xl border bg-muted/30" />
            </div>
        </div>
    );
}
