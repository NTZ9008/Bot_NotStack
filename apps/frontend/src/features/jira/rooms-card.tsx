import { JIRA_LIMITS, type GuildChannel, type GuildRole } from '@notstack/shared';
import { ChannelSelect } from '@/components/channel-select';
import { Field } from '@/components/field';
import { IdChoices } from '@/components/id-choices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { clampInt, type JiraDraftProps } from './draft';

// 3. ห้องแผง / ห้อง log / หมวดหมู่ของห้องส่วนตัว / ปิดห้องอัตโนมัติ / ยศทีมงาน
export function JiraRoomsCard({
    draft,
    patch,
    patchOptions,
    textChannels,
    categories,
    roles,
}: JiraDraftProps & { textChannels: GuildChannel[]; categories: GuildChannel[]; roles: GuildRole[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>3. ห้องและสิทธิ์</CardTitle>
                <CardDescription>ห้องส่วนตัวที่สร้างขึ้นเห็นเฉพาะคนเปิด บอท และยศทีมงานที่เลือก (ผู้มีสิทธิ์ Administrator เห็นทุกห้องเสมอ)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="ห้องแผง" hint="ห้องที่มีปุ่ม “เปิด Jira card” ให้สมาชิกกด">
                    <ChannelSelect channels={textChannels} value={draft.panelChannelId} onChange={(panelChannelId) => patch({ panelChannelId })} />
                </Field>
                <Field label="ห้อง log" hint="แจ้งว่าใครเปิด card อะไร พร้อมลิงก์ (ไม่แท็กใคร)">
                    <ChannelSelect
                        channels={textChannels}
                        value={draft.logChannelId}
                        onChange={(logChannelId) => patch({ logChannelId })}
                        noneLabel="— ไม่ส่ง log —"
                    />
                </Field>
                <Field label="หมวดหมู่ของห้องส่วนตัว" hint="ห้องส่วนตัวจะถูกสร้างในหมวดหมู่นี้">
                    <ChannelSelect
                        channels={categories}
                        showCategories
                        value={draft.categoryId}
                        onChange={(categoryId) => patch({ categoryId })}
                        noneLabel="— ไม่อยู่ในหมวดหมู่ —"
                    />
                </Field>
                <Field
                    label="ปิดห้องอัตโนมัติหลังสร้าง card (วินาที)"
                    htmlFor="jira-auto-close"
                    hint={`0 = ไม่ปิดเอง (คนเปิด/ทีมงานกดปุ่มปิดห้องเอง) · สูงสุด ${JIRA_LIMITS.maxAutoCloseSeconds} วินาที — ในห้องจะขึ้นเวลานับถอยหลังให้เห็น`}
                >
                    <Input
                        id="jira-auto-close"
                        type="number"
                        inputMode="numeric"
                        className="w-28"
                        min={0}
                        max={JIRA_LIMITS.maxAutoCloseSeconds}
                        value={draft.options.autoCloseSeconds}
                        onChange={(e) => patchOptions({ autoCloseSeconds: clampInt(e.target.value, JIRA_LIMITS.maxAutoCloseSeconds) })}
                    />
                </Field>
                <IdChoices
                    title="ยศทีมงานที่เห็นทุกห้อง"
                    options={roles}
                    values={draft.options.staffRoleIds}
                    onChange={(staffRoleIds) => patchOptions({ staffRoleIds: staffRoleIds.slice(0, JIRA_LIMITS.maxStaffRoles) })}
                    emptyHint="ไม่เลือก = เห็นเฉพาะคนเปิด (และผู้มีสิทธิ์ Administrator) — ทีมงานยังปิดห้องได้ถ้ามีสิทธิ์ Manage Channels"
                />
            </CardContent>
        </Card>
    );
}
