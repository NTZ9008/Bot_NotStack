import type { GuildSummary } from '@notstack/shared';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { AlertTriangle, ChevronRight, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { guildsQuery } from '@/api/guilds';
import { DiscordIcon } from '@/components/discord-icon';
import { GuildIcon } from '@/components/guild-icon';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { apiUrl } from '@/lib/api';
import { formatNumber } from '@/lib/format';

// ?denied=true → เพิ่งถูกพากลับมาเพราะไม่มีสิทธิ์ในเซิร์ฟเวอร์ที่เปิด
export const Route = createFileRoute('/_app/servers/')({
    validateSearch: (search: Record<string, unknown>): { denied?: boolean } => (search.denied === true || search.denied === 'true' ? { denied: true } : {}),
    component: ServersPage,
});

function GuildCard({ guild }: { guild: GuildSummary }) {
    return (
        <Link
            to="/servers/$guildId"
            params={{ guildId: guild.id }}
            className="group flex items-center gap-4 rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
            <GuildIcon guild={guild} className="size-14 text-lg" />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate font-semibold">{guild.name}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {guild.memberCount > 0 && (
                        <span className="inline-flex items-center gap-1">
                            <Users className="size-3" /> {formatNumber(guild.memberCount)} คน
                        </span>
                    )}
                    {guild.isHome && <Badge variant="secondary">เซิร์ฟเวอร์หลัก</Badge>}
                    {guild.access === 'manage' ? (
                        <Badge className="bg-emerald-500/15 text-emerald-300">
                            <ShieldCheck /> จัดการได้
                        </Badge>
                    ) : (
                        <Badge variant="outline">ดูอันดับได้อย่างเดียว</Badge>
                    )}
                </div>
            </div>
            <ChevronRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Link>
    );
}

// ==========================================
// 🏰 เลือกเซิร์ฟเวอร์ — เซิร์ฟเวอร์ที่บอทอยู่และผู้ใช้เข้าถึงได้ + ปุ่มเชิญบอทเข้าเซิร์ฟเวอร์ของตัวเอง
// ==========================================
function ServersPage() {
    const { denied } = Route.useSearch();
    const { discordEnabled } = useAuth();
    const { data, isLoading, error, refetch, isFetching } = useQuery(guildsQuery);

    return (
        <>
            <PageHeader
                title="เซิร์ฟเวอร์ของคุณ"
                description="เลือกเซิร์ฟเวอร์ที่จะตั้งค่าบอท — เห็นเฉพาะเซิร์ฟเวอร์ที่บอทอยู่และคุณเป็นสมาชิก (ต้องมีสิทธิ์ Manage Server ถึงจะตั้งค่าได้)"
                actions={
                    <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
                        <RefreshCw className={isFetching ? 'animate-spin' : undefined} /> รีเฟรช
                    </Button>
                }
            />

            {denied && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                    <p>คุณไม่มีสิทธิ์ในเซิร์ฟเวอร์นั้น หรือบอทไม่ได้อยู่ในเซิร์ฟเวอร์นั้นแล้ว</p>
                </div>
            )}

            {data?.needsDiscordLink && (
                <Card>
                    <CardHeader>
                        <CardTitle>เชื่อมต่อบัญชี Discord ก่อน</CardTitle>
                        <CardDescription>ระบบใช้บัญชี Discord ของคุณตรวจว่าคุณอยู่เซิร์ฟเวอร์ไหน และมีสิทธิ์ Manage Server หรือไม่</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {discordEnabled ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={apiUrl('/auth/discord/link')}>
                                    <DiscordIcon /> เชื่อมต่อบัญชี Discord
                                </a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">ผู้ดูแลระบบยังไม่ได้ตั้งค่า Discord OAuth</p>
                        )}
                    </CardContent>
                </Card>
            )}

            {data && !data.botOnline && (
                <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
                    <p>บอทยังไม่ออนไลน์ — รายชื่อเซิร์ฟเวอร์อาจไม่ครบ และเชิญบอทเพิ่มยังไม่ได้ตอนนี้</p>
                </div>
            )}

            {isLoading ? (
                <LoadingState />
            ) : error ? (
                <ErrorState error={error} />
            ) : (
                <div className="grid gap-3 md:grid-cols-2">
                    {data?.guilds.map((guild) => <GuildCard key={guild.id} guild={guild} />)}

                    {/* เชิญบอทเข้าเซิร์ฟเวอร์ใหม่ — Discord ให้เลือกได้เฉพาะเซิร์ฟเวอร์ที่ผู้ใช้มีสิทธิ์ Manage Server */}
                    <div className="flex items-center gap-4 rounded-xl border border-dashed p-4">
                        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                            <Plus className="size-6" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-semibold">เพิ่มบอทเข้าเซิร์ฟเวอร์ของคุณ</p>
                            <p className="text-xs text-muted-foreground">เชิญบอทแล้วกลับมาหน้านี้ เซิร์ฟเวอร์จะขึ้นในรายการเอง</p>
                        </div>
                        {data?.inviteUrl ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={data.inviteUrl} target="_blank" rel="noopener noreferrer">
                                    <DiscordIcon /> เชิญบอท
                                </a>
                            </Button>
                        ) : (
                            <Button disabled title="บอทยังไม่ออนไลน์">
                                <DiscordIcon /> เชิญบอท
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {data && data.guilds.length === 0 && !data.needsDiscordLink && (
                <p className="text-center text-sm text-muted-foreground">ยังไม่มีเซิร์ฟเวอร์ที่คุณเข้าถึงได้ — เชิญบอทเข้าเซิร์ฟเวอร์ของคุณเพื่อเริ่มใช้งาน</p>
            )}
        </>
    );
}
