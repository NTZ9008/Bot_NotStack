import { AUDIT_GROUP_LABELS, auditLabel, type ActivityItem, type AuditLogItem } from '@notstack/shared';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Loader2, Search } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { activityMetaQuery, activityQuery, auditActionsQuery, auditLogsQuery, type ActivityFilters, type AuditFilters } from '@/api/admin';
import { DataTable } from '@/components/data-table';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { formatDateTime, formatNumber } from '@/lib/format';

// ==========================================
// 📜 ตารางประวัติ: การกระทำบน Dashboard (audit log) + เหตุการณ์ในเซิร์ฟเวอร์ Discord (activity log)
// ใช้ทั้งหน้า Audit & Activity ของแต่ละเซิร์ฟเวอร์ และหน้า System Audit ของ ADMIN
// ==========================================
const ALL = '__all__';

// สีของป้าย action ตามหมวด
const GROUP_TONE: Record<string, string> = {
    auth: 'bg-indigo-500/15 text-indigo-300',
    user: 'bg-emerald-500/15 text-emerald-300',
    config: 'bg-amber-500/15 text-amber-300',
    news: 'bg-rose-500/15 text-rose-300',
    room_access: 'bg-sky-500/15 text-sky-300',
    voice_guard: 'bg-cyan-500/15 text-cyan-300',
    log_settings: 'bg-violet-500/15 text-violet-300',
    pr_bot: 'bg-fuchsia-500/15 text-fuchsia-300',
    welcome: 'bg-pink-500/15 text-pink-300',
    weather: 'bg-orange-500/15 text-orange-300',
};

// สีของป้ายชนิดเหตุการณ์ อิงจากหมวดของ Log Manager
const ACTIVITY_TONE: Record<string, string> = {
    สมาชิก: 'bg-emerald-500/15 text-emerald-300',
    ข้อความ: 'bg-indigo-500/15 text-indigo-300',
    'ช่อง & เธรด': 'bg-amber-500/15 text-amber-300',
    'บทบาท & เซิร์ฟเวอร์': 'bg-amber-500/15 text-amber-300',
    ห้องเสียง: 'bg-sky-500/15 text-sky-300',
    'ความปลอดภัย & AutoMod': 'bg-rose-500/15 text-rose-300',
};

function ActionBadge({ tone, label, code }: { tone?: string; label: string; code: string }) {
    return (
        <div>
            <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', tone ?? 'bg-muted text-muted-foreground')}>{label}</span>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{code}</p>
        </div>
    );
}

function DetailDialog({ title, rows, json, onClose }: { title: string | null; rows: [string, ReactNode][]; json?: unknown; onClose: () => void }) {
    return (
        <Dialog open={title !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <dl className="divide-y text-sm">
                    {rows.map(([label, value]) => (
                        <div key={label} className="grid grid-cols-[8rem_1fr] gap-3 py-2">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="min-w-0 break-words">{value}</dd>
                        </div>
                    ))}
                </dl>
                {json !== undefined && json !== null && (
                    <pre className="overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs">{JSON.stringify(json, null, 2)}</pre>
                )}
            </DialogContent>
        </Dialog>
    );
}

function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage }: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => void }) {
    if (!hasNextPage) return null;
    return (
        <div className="flex justify-center">
            <Button variant="outline" onClick={fetchNextPage} disabled={isFetchingNextPage}>
                {isFetchingNextPage && <Loader2 className="animate-spin" />} โหลดเพิ่ม
            </Button>
        </div>
    );
}

// ==========================================
// การกระทำบน Dashboard
// ==========================================
// การกระทำบน Dashboard — guildId = เฉพาะการแก้ค่าของเซิร์ฟเวอร์นั้น, ไม่ระบุ = ทั้งระบบ (ADMIN)
export function DashboardAudit({ guildId }: { guildId?: string }) {
    const [draft, setDraft] = useState<AuditFilters>({});
    const [filters, setFilters] = useState<AuditFilters>({});
    const [detail, setDetail] = useState<AuditLogItem | null>(null);
    const { data: actions = [] } = useQuery(auditActionsQuery(guildId));
    const logs = useInfiniteQuery(auditLogsQuery(filters, guildId));
    const groups = [...new Set(actions.map((action) => action.split('.')[0]!))];
    const items = logs.data?.pages.flatMap((page) => page.items) ?? [];

    const columns: ColumnDef<AuditLogItem>[] = [
        { accessorKey: 'createdAt', header: 'เวลา', cell: ({ row }) => <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
        { accessorKey: 'actorName', header: 'ผู้กระทำ', cell: ({ row }) => row.original.actorName ?? <span className="text-muted-foreground">ไม่ทราบ</span> },
        {
            accessorKey: 'action',
            header: 'Action',
            cell: ({ row }) => (
                <ActionBadge tone={GROUP_TONE[row.original.action.split('.')[0]!]} label={auditLabel(row.original.action)} code={row.original.action} />
            ),
        },
        {
            id: 'target',
            header: 'เป้าหมาย',
            cell: ({ row: { original: item } }) => (
                <span className="text-xs">{item.targetId ? `${item.targetType ? `${item.targetType}: ` : ''}${item.targetId}` : '—'}</span>
            ),
        },
        { accessorKey: 'ip', header: 'IP', cell: ({ row }) => <span className="font-mono text-xs">{row.original.ip ?? '—'}</span> },
        {
            accessorKey: 'success',
            header: 'ผลลัพธ์',
            cell: ({ row }) =>
                row.original.success ? (
                    <Badge className="bg-emerald-500/15 text-emerald-300">สำเร็จ</Badge>
                ) : (
                    <Badge variant="destructive">ไม่สำเร็จ</Badge>
                ),
        },
        {
            id: 'view',
            header: '',
            cell: ({ row }) => (
                <Button size="xs" variant="outline" onClick={() => setDetail(row.original)}>
                    ดู
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">การเข้าสู่ระบบและทุกการเปลี่ยนแปลงที่ทำผ่าน Dashboard (เก็บย้อนหลัง 180 วัน)</p>
            <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    setFilters({ ...draft, q: draft.q?.trim() || undefined });
                }}
            >
                <Select value={draft.action ?? ALL} onValueChange={(value) => setDraft((d) => ({ ...d, action: value === ALL ? undefined : value }))}>
                    <SelectTrigger className="w-64">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                        <SelectItem value={ALL}>ทุก action</SelectItem>
                        <SelectGroup>
                            <SelectLabel>ทั้งหมวด</SelectLabel>
                            {groups.map((group) => (
                                <SelectItem key={group} value={`${group}.`}>
                                    {AUDIT_GROUP_LABELS[group] ?? group} (ทั้งหมด)
                                </SelectItem>
                            ))}
                        </SelectGroup>
                        <SelectGroup>
                            <SelectLabel>แยก action</SelectLabel>
                            {actions.map((action) => (
                                <SelectItem key={action} value={action}>
                                    {auditLabel(action)} — {action}
                                </SelectItem>
                            ))}
                        </SelectGroup>
                    </SelectContent>
                </Select>
                <Select value={draft.success ?? ALL} onValueChange={(value) => setDraft((d) => ({ ...d, success: value === ALL ? undefined : value }))}>
                    <SelectTrigger className="w-48">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL}>ทุกผลลัพธ์</SelectItem>
                        <SelectItem value="true">สำเร็จ</SelectItem>
                        <SelectItem value="false">ไม่สำเร็จ / ถูกปฏิเสธ</SelectItem>
                    </SelectContent>
                </Select>
                <Input className="w-64" placeholder="ค้นหาผู้กระทำ / เป้าหมาย / IP" value={draft.q ?? ''} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} />
                <Button type="submit">
                    <Search /> ค้นหา
                </Button>
            </form>

            {logs.isLoading ? (
                <LoadingState />
            ) : logs.error ? (
                <ErrorState error={logs.error} />
            ) : (
                <DataTable columns={columns} data={items} empty="ไม่พบรายการ" />
            )}
            <LoadMore hasNextPage={logs.hasNextPage} isFetchingNextPage={logs.isFetchingNextPage} fetchNextPage={() => void logs.fetchNextPage()} />

            <DetailDialog
                title={detail ? auditLabel(detail.action) : null}
                onClose={() => setDetail(null)}
                rows={
                    detail
                        ? [
                              ['เวลา', formatDateTime(detail.createdAt)],
                              ['ผู้กระทำ', `${detail.actorName ?? 'ไม่ทราบ'}${detail.actorId ? ` (#${detail.actorId})` : ''}`],
                              ['Action', <code key="a">{detail.action}</code>],
                              ['IP', detail.ip ?? '—'],
                              ['User-Agent', detail.userAgent ?? '—'],
                          ]
                        : []
                }
                json={detail?.metadata}
            />
        </div>
    );
}

// ==========================================
// เหตุการณ์ในเซิร์ฟเวอร์ Discord (ตาราง activity_events)
// ==========================================
const RANGES = [
    { hours: 24, label: '24 ชั่วโมงล่าสุด' },
    { hours: 168, label: '7 วันล่าสุด' },
    { hours: 720, label: '30 วันล่าสุด' },
    { hours: 2160, label: '90 วันล่าสุด' },
    { hours: 8760, label: '1 ปีล่าสุด' },
];

// เหตุการณ์ในเซิร์ฟเวอร์ Discord (Activity Log ของเซิร์ฟเวอร์นั้น)
export function DiscordActivity({ guildId }: { guildId: string }) {
    const [filters, setFilters] = useState<ActivityFilters>({ hours: 168, includeBots: false });
    const [q, setQ] = useState('');
    const [detail, setDetail] = useState<ActivityItem | null>(null);
    const meta = useQuery(activityMetaQuery(guildId));
    const logs = useInfiniteQuery(activityQuery(guildId, filters));
    const items = logs.data?.pages.flatMap((page) => page.items) ?? [];

    const eventGroups = new Map<string, { key: string; label: string }[]>();
    for (const type of meta.data?.eventTypes ?? []) eventGroups.set(type.group, [...(eventGroups.get(type.group) ?? []), type]);

    const columns: ColumnDef<ActivityItem>[] = [
        { accessorKey: 'createdAt', header: 'เวลา', cell: ({ row }) => <span className="text-xs whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
        { accessorKey: 'label', header: 'เหตุการณ์', cell: ({ row }) => <ActionBadge tone={ACTIVITY_TONE[row.original.group]} label={row.original.label} code={row.original.eventKey} /> },
        {
            id: 'user',
            header: 'ผู้ใช้',
            cell: ({ row: { original: item } }) => (
                <div>
                    <p className="flex items-center gap-1.5">
                        {item.userName ?? <span className="text-muted-foreground">—</span>}
                        {item.isBot && <Badge variant="secondary">BOT</Badge>}
                    </p>
                    {item.userId && <p className="font-mono text-[11px] text-muted-foreground">{item.userId}</p>}
                </div>
            ),
        },
        { accessorKey: 'channelName', header: 'ห้อง', cell: ({ row }) => <span className="text-xs">{row.original.channelName ? `#${row.original.channelName}` : '—'}</span> },
        { accessorKey: 'executorName', header: 'ผู้ลงมือ', cell: ({ row }) => <span className="text-xs">{row.original.executorName ?? '—'}</span> },
        { accessorKey: 'summary', header: 'รายละเอียด', cell: ({ row }) => <span className="line-clamp-2 text-xs">{row.original.summary ?? '—'}</span> },
        {
            id: 'view',
            header: '',
            cell: ({ row }) => (
                <Button size="xs" variant="outline" onClick={() => setDetail(row.original)}>
                    ดู
                </Button>
            ),
        },
    ];

    const metaText = meta.data
        ? [
              meta.data.enabled ? 'กำลังบันทึกอยู่' : '⚠️ ปิดการบันทึกอยู่ (เปิดได้ที่แท็บ Log Management)',
              meta.data.since ? `เริ่มเก็บตั้งแต่ ${formatDateTime(meta.data.since)}` : 'ยังไม่มีข้อมูล',
              `ทั้งหมด ${formatNumber(meta.data.total)} รายการ`,
              `เก็บย้อนหลัง ${meta.data.retentionDays} วัน`,
          ].join(' · ')
        : 'กำลังโหลดข้อมูล...';

    const { fields = [], ...restMetadata } = detail?.metadata ?? {};

    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{metaText}</p>
            <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    setFilters((f) => ({ ...f, q: q.trim() || undefined }));
                }}
            >
                <Select value={filters.eventKey ?? ALL} onValueChange={(value) => setFilters((f) => ({ ...f, eventKey: value === ALL ? undefined : value }))}>
                    <SelectTrigger className="w-60">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-80">
                        <SelectItem value={ALL}>ทุกเหตุการณ์</SelectItem>
                        {[...eventGroups.entries()].map(([group, types]) => (
                            <SelectGroup key={group}>
                                <SelectLabel>{group}</SelectLabel>
                                {types.map((type) => (
                                    <SelectItem key={type.key} value={type.key}>
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectGroup>
                        ))}
                    </SelectContent>
                </Select>
                <Select value={String(filters.hours)} onValueChange={(value) => setFilters((f) => ({ ...f, hours: Number(value) }))}>
                    <SelectTrigger className="w-44">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {RANGES.map((range) => (
                            <SelectItem key={range.hours} value={String(range.hours)}>
                                {range.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input className="w-64" placeholder="ค้นหาชื่อ / ห้อง / รายละเอียด / User ID" value={q} onChange={(e) => setQ(e.target.value)} />
                <Label className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                    รวมบอท
                    <Switch checked={filters.includeBots} onCheckedChange={(includeBots) => setFilters((f) => ({ ...f, includeBots }))} />
                </Label>
                <Button type="submit">
                    <Search /> ค้นหา
                </Button>
            </form>

            {logs.isLoading ? (
                <LoadingState />
            ) : logs.error ? (
                <ErrorState error={logs.error} />
            ) : (
                <DataTable columns={columns} data={items} empty="ไม่พบเหตุการณ์ในช่วงเวลานี้" />
            )}
            <LoadMore hasNextPage={logs.hasNextPage} isFetchingNextPage={logs.isFetchingNextPage} fetchNextPage={() => void logs.fetchNextPage()} />

            <DetailDialog
                title={detail?.label ?? null}
                onClose={() => setDetail(null)}
                rows={
                    detail
                        ? [
                              ['เวลา', formatDateTime(detail.createdAt)],
                              ['เหตุการณ์', <code key="e">{detail.eventKey}</code>],
                              ['ผู้ใช้', `${detail.userName ?? '—'}${detail.userId ? ` (${detail.userId})` : ''}`],
                              ['ห้อง', detail.channelName ? `#${detail.channelName}` : '—'],
                              ['ผู้ลงมือ', detail.executorName ?? '—'],
                              ['รายละเอียด', detail.summary ?? '—'],
                              ...fields.map((f): [string, ReactNode] => [f.name, f.value]),
                          ]
                        : []
                }
                json={Object.keys(restMetadata).length ? restMetadata : undefined}
            />
        </div>
    );
}
