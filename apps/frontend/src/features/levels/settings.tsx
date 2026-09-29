import {
    defaultXpRule,
    defaultXpSettings,
    XP_SOURCES,
    XP_SOURCE_LABELS,
    xpAtLevel,
    xpSettingsSchema,
    type XpRule,
    type XpSettingsResponse,
} from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Copy, Plus, Save, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { xpApi, xpKey, xpSettingsQuery } from '@/api/levels';
import { useConfirm } from '@/components/confirm-dialog';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/api';

const selectClass = 'h-9 w-full rounded-md border bg-background px-3 text-sm';
export function NumberField({
    label,
    value,
    onChange,
    min = 0,
    max,
    step = 1,
}: {
    label: string;
    value: number;
    onChange: (v: number) => void;
    min?: number;
    max?: number;
    step?: number;
}) {
    return (
        <label className="grid gap-1.5 text-sm">
            {label}
            <Input
                type="number"
                value={Number.isNaN(value) ? '' : value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(e.target.valueAsNumber)}
            />
        </label>
    );
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    const id = useId();
    return (
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <label htmlFor={id} className="text-sm">
                {label}
            </label>
            <Switch id={id} checked={checked} onCheckedChange={onChange} />
        </div>
    );
}
function IdChoices({
    title,
    options,
    values,
    onChange,
}: {
    title: string;
    options: { id: string; name: string }[];
    values: string[];
    onChange: (v: string[]) => void;
}) {
    const [search, setSearch] = useState('');
    const all = [...options, ...values.filter((id) => !options.some((o) => o.id === id)).map((id) => ({ id, name: `${id} (ไม่พบใน Discord)` }))];
    return (
        <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm">
                {title} · เลือก {values.length}
            </summary>
            <Input
                aria-label={`ค้นหา${title}`}
                placeholder="ค้นหาชื่อหรือ ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="my-2"
            />
            <div className="grid max-h-48 gap-2 overflow-y-auto">
                {all
                    .filter((o) => `${o.name} ${o.id}`.toLowerCase().includes(search.toLowerCase()))
                    .map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={values.includes(o.id)}
                                onChange={(e) => onChange(e.target.checked ? [...values, o.id] : values.filter((id) => id !== o.id))}
                            />
                            {o.name}
                        </label>
                    ))}
                {!all.length && <p className="text-xs text-muted-foreground">ยังไม่มีรายการให้เลือก</p>}
            </div>
        </details>
    );
}

export function XpSettingsPanel({ guildId }: { guildId: string }) {
    const query = useQuery(xpSettingsQuery(guildId));
    if (query.isLoading) return <LoadingState />;
    if (query.error) return <ErrorState error={query.error} />;
    return query.data ? <SettingsEditor key={guildId} initial={query.data} guildId={guildId} /> : null;
}
function SettingsEditor({ initial, guildId }: { initial: XpSettingsResponse; guildId: string }) {
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState(initial.settings);
    const [commandText, setCommandText] = useState<Record<string, string>>({});
    const client = useQueryClient(),
        confirm = useConfirm();
    const channels = useQuery(guildChannelsQuery(guildId));
    const roles = useQuery(guildRolesQuery(guildId));
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved.settings);
    const parsed = xpSettingsSchema.safeParse(draft);
    const patch = (data: Partial<typeof draft>) => setDraft((old) => ({ ...old, ...data }));
    const patchRule = (id: string, data: Partial<XpRule>) =>
        setDraft((old) => ({ ...old, rules: old.rules.map((r) => (r.id === id ? { ...r, ...data } : r)) }));
    useBlocker({
        shouldBlockFn: async () => dirty && !(await confirm({ title: 'ทิ้งการตั้งค่า XP ที่ยังไม่บันทึก?', destructive: true })),
        enableBeforeUnload: () => dirty,
    });
    const save = useMutation({
        mutationFn: () => xpApi.save(guildId, { revision: saved.revision, settings: xpSettingsSchema.parse(draft) }),
        onSuccess: (data) => {
            setSaved(data);
            setDraft(data.settings);
            setCommandText({});
            client.setQueryData(xpSettingsQuery(guildId).queryKey, data);
            void client.invalidateQueries({ queryKey: xpKey(guildId) });
            toast.success('บันทึกกฎ XP แล้ว');
        },
        onError: (err) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const channelOptions = (channels.data ?? []).map((c) => ({ id: c.id, name: `${c.isCategory ? 'หมวด' : '#'} ${c.name}` }));
    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">การเปลี่ยนสูตรเลเวลคง XP เดิมไว้ · เพดานรายวันรีเซ็ตเวลา 00:00 ไทย</p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        disabled={save.isPending}
                        onClick={async () => {
                            if (dirty && !(await confirm({ title: 'ทิ้งการแก้ไขแล้วโหลดค่าล่าสุด?', destructive: true }))) return;
                            try {
                                const latest = await client.fetchQuery({ ...xpSettingsQuery(guildId), staleTime: 0 });
                                setSaved(latest);
                                setDraft(latest.settings);
                                setCommandText({});
                            } catch (err) {
                                toast.error(errorMessage(err));
                            }
                        }}
                    >
                        โหลดใหม่
                    </Button>
                    <Button disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate()}>
                        <Save />
                        {save.isPending ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}
                    </Button>
                </div>
            </div>
            {!parsed.success && (
                <p role="alert" className="text-sm text-destructive">
                    {parsed.error.issues[0]?.path.join('.')} — {parsed.error.issues[0]?.message}
                </p>
            )}
            <fieldset disabled={save.isPending} className="space-y-5">
                <Card>
                    <CardHeader>
                        <CardTitle>ภาพรวมระบบ XP</CardTitle>
                        <CardDescription>100% = อัตราปกติ · 150% = 1.5 เท่า · เพดาน 0 = ไม่จำกัด</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Toggle label="เปิดรับ XP จากกิจกรรม" checked={draft.enabled} onChange={(enabled) => patch({ enabled })} />
                        <div className="grid gap-4 sm:grid-cols-2">
                            <NumberField
                                label="ตัวคูณทั้งเซิร์ฟเวอร์ (%)"
                                value={draft.multiplierPercent}
                                max={1000}
                                onChange={(multiplierPercent) => patch({ multiplierPercent })}
                            />
                            <NumberField
                                label="XP สูงสุดต่อคนต่อวัน (ทุกกฎรวมกัน)"
                                value={draft.dailyCap}
                                max={2000000000}
                                onChange={(dailyCap) => patch({ dailyCap })}
                            />
                            <NumberField
                                label="ฐาน XP ของสูตรเลเวล"
                                value={draft.curveBase}
                                min={1}
                                max={100000}
                                onChange={(curveBase) => patch({ curveBase })}
                            />
                            <NumberField
                                label="เลขยกกำลังของสูตร"
                                value={draft.curveExponent}
                                min={1}
                                max={3}
                                step={0.1}
                                onChange={(curveExponent) => patch({ curveExponent })}
                            />
                        </div>
                        <p className="text-sm text-muted-foreground">XP สะสมที่ต้องมี = ปัดขึ้น(ฐาน × เลเวล^เลขยกกำลัง)</p>
                        <div className="grid grid-cols-3 gap-2">
                            {[1, 5, 10].map((level) => (
                                <div className="rounded-md bg-muted p-3 text-center" key={level}>
                                    <p className="text-xs text-muted-foreground">Level {level}</p>
                                    <p className="font-semibold">{xpAtLevel(level, draft).toLocaleString()} XP</p>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>เงื่อนไขการรับ XP</CardTitle>
                        <CardDescription>บอทไม่ได้ XP · ห้องที่ยกเว้นรวมถึงเธรดภายในห้องนั้น</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <NumberField
                            label="จำนวนตัวอักษรขั้นต่ำของข้อความ"
                            value={draft.messageMinLength}
                            max={4000}
                            onChange={(messageMinLength) => patch({ messageMinLength })}
                        />
                        <NumberField
                            label="จำนวนคนขั้นต่ำในห้องเสียง (ไม่นับบอท)"
                            value={draft.voiceMinMembers}
                            min={1}
                            max={99}
                            onChange={(voiceMinMembers) => patch({ voiceMinMembers })}
                        />
                        <Toggle
                            label="ไม่ให้ XP เมื่อปิดไมค์"
                            checked={draft.voiceIgnoreMuted}
                            onChange={(voiceIgnoreMuted) => patch({ voiceIgnoreMuted })}
                        />
                        <Toggle
                            label="ไม่ให้ XP เมื่อปิดหูฟัง"
                            checked={draft.voiceIgnoreDeafened}
                            onChange={(voiceIgnoreDeafened) => patch({ voiceIgnoreDeafened })}
                        />
                        <Toggle
                            label="ไม่ให้ XP ในห้อง AFK"
                            checked={draft.voiceIgnoreAfk}
                            onChange={(voiceIgnoreAfk) => patch({ voiceIgnoreAfk })}
                        />
                        <IdChoices
                            title="ห้อง/หมวดที่ยกเว้น"
                            options={channelOptions}
                            values={draft.excludedChannelIds}
                            onChange={(excludedChannelIds) => patch({ excludedChannelIds })}
                        />
                        <IdChoices
                            title="ยศที่ยกเว้น"
                            options={roles.data ?? []}
                            values={draft.excludedRoleIds}
                            onChange={(excludedRoleIds) => patch({ excludedRoleIds })}
                        />
                    </CardContent>
                </Card>
                <div className="space-y-2">
                    <h2 className="text-lg font-semibold">กฎการรับ XP ({draft.rules.length}/50)</h2>
                    <p className="text-sm text-muted-foreground">
                        กฎที่ตรงเงื่อนไขจะให้ XP รวมกันตามลำดับด้านล่าง จนถึงเพดานรายวัน · ไม่เลือกห้อง/ยศ = ทั้งหมด · cooldown
                        เริ่มนับทุกครั้งที่มีสิทธิ์สุ่ม แม้สุ่มไม่ได้ XP
                    </p>
                </div>
                {draft.rules.map((rule, index) => (
                    <Card key={rule.id}>
                        <CardHeader>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle>
                                    {index + 1}. {rule.name}
                                </CardTitle>
                                <div className="flex gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`คัดลอก ${rule.name}`}
                                        disabled={draft.rules.length >= 50}
                                        onClick={() =>
                                            patch({
                                                rules: [
                                                    ...draft.rules,
                                                    { ...structuredClone(rule), id: crypto.randomUUID(), name: `${rule.name} (สำเนา)`.slice(0, 80) },
                                                ],
                                            })
                                        }
                                    >
                                        <Copy />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        aria-label={`ลบ ${rule.name}`}
                                        onClick={async () => {
                                            if (
                                                await confirm({
                                                    title: `ลบกฎ ${rule.name}?`,
                                                    description: 'XP เดิมของสมาชิกยังอยู่ กดบันทึกทั้งหมดเพื่อยืนยันการเปลี่ยนแปลง',
                                                    destructive: true,
                                                })
                                            )
                                                patch({ rules: draft.rules.filter((r) => r.id !== rule.id) });
                                        }}
                                    >
                                        <Trash2 />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Toggle label="เปิดใช้กฎนี้" checked={rule.enabled} onChange={(enabled) => patchRule(rule.id, { enabled })} />
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <label className="grid gap-1.5 text-sm">
                                    ชื่อกฎ
                                    <Input value={rule.name} maxLength={80} onChange={(e) => patchRule(rule.id, { name: e.target.value })} />
                                </label>
                                <label className="grid gap-1.5 text-sm">
                                    กิจกรรม
                                    <select
                                        className={selectClass}
                                        value={rule.source}
                                        onChange={(e) => patchRule(rule.id, { source: e.target.value as XpRule['source'] })}
                                    >
                                        {XP_SOURCES.map((v) => (
                                            <option key={v} value={v}>
                                                {XP_SOURCE_LABELS[v]}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <NumberField
                                    label="XP ต่ำสุดต่อครั้ง"
                                    value={rule.minXp}
                                    max={100000}
                                    onChange={(minXp) => patchRule(rule.id, { minXp })}
                                />
                                <NumberField
                                    label="XP สูงสุดต่อครั้ง"
                                    value={rule.maxXp}
                                    max={100000}
                                    onChange={(maxXp) => patchRule(rule.id, { maxXp })}
                                />
                                <NumberField
                                    label="ตัวคูณกฎนี้ (%)"
                                    value={rule.multiplierPercent}
                                    max={1000}
                                    onChange={(multiplierPercent) => patchRule(rule.id, { multiplierPercent })}
                                />
                                <NumberField
                                    label="โอกาสได้รับ XP (%)"
                                    value={rule.chancePercent}
                                    max={100}
                                    onChange={(chancePercent) => patchRule(rule.id, { chancePercent })}
                                />
                                <NumberField
                                    label="Cooldown (วินาที)"
                                    value={rule.cooldownSeconds}
                                    min={1}
                                    max={86400}
                                    onChange={(cooldownSeconds) => patchRule(rule.id, { cooldownSeconds })}
                                />
                                <NumberField
                                    label="เพดาน XP ของกฎต่อคนต่อวัน"
                                    value={rule.dailyCap}
                                    max={2000000000}
                                    onChange={(dailyCap) => patchRule(rule.id, { dailyCap })}
                                />
                            </div>
                            <p className="rounded-md bg-primary/10 p-3 text-sm">
                                เมื่อได้รับ:{' '}
                                <strong>
                                    {Math.floor((((rule.minXp * rule.multiplierPercent) / 100) * draft.multiplierPercent) / 100).toLocaleString()}–
                                    {Math.floor((((rule.maxXp * rule.multiplierPercent) / 100) * draft.multiplierPercent) / 100).toLocaleString()} XP
                                </strong>{' '}
                                / ครั้ง · โอกาส {rule.chancePercent}%{rule.source === 'voice' && ' · ตรวจห้องเสียงทุก 15 วินาที'}
                            </p>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <IdChoices
                                    title="ให้เฉพาะห้อง/หมวด"
                                    options={channelOptions}
                                    values={rule.channelIds}
                                    onChange={(channelIds) => patchRule(rule.id, { channelIds })}
                                />
                                <IdChoices
                                    title="ให้เฉพาะผู้มียศใดยศหนึ่ง"
                                    options={roles.data ?? []}
                                    values={rule.roleIds}
                                    onChange={(roleIds) => patchRule(rule.id, { roleIds })}
                                />
                            </div>
                            {rule.source === 'command' && (
                                <label className="grid gap-1.5 text-sm">
                                    ชื่อคำสั่ง คั่นด้วย comma (ว่าง = ทุกคำสั่งที่บอทรองรับ)
                                    <Input
                                        value={commandText[rule.id] ?? rule.commands.join(', ')}
                                        placeholder="ping, weather"
                                        onChange={(e) => {
                                            const text = e.target.value;
                                            setCommandText((old) => ({ ...old, [rule.id]: text }));
                                            patchRule(rule.id, {
                                                commands: text
                                                    .split(',')
                                                    .map((v) => v.trim().replace(/^\//, ''))
                                                    .filter(Boolean),
                                            });
                                        }}
                                    />
                                </label>
                            )}
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={index === 0}
                                    onClick={() => {
                                        const rules = [...draft.rules];
                                        [rules[index - 1], rules[index]] = [rules[index]!, rules[index - 1]!];
                                        patch({ rules });
                                    }}
                                >
                                    เลื่อนขึ้น
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    disabled={index === draft.rules.length - 1}
                                    onClick={() => {
                                        const rules = [...draft.rules];
                                        [rules[index], rules[index + 1]] = [rules[index + 1]!, rules[index]!];
                                        patch({ rules });
                                    }}
                                >
                                    เลื่อนลง
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
                {!draft.rules.length && (
                    <p className="rounded-md border border-dashed p-6 text-center text-muted-foreground">ยังไม่มีกฎ สมาชิกจะไม่ได้ XP อัตโนมัติ</p>
                )}
                <div className="flex flex-wrap gap-2">
                    {XP_SOURCES.map((source) => (
                        <Button
                            key={source}
                            variant="outline"
                            disabled={draft.rules.length >= 50}
                            onClick={() => patch({ rules: [...draft.rules, { ...defaultXpRule(source, crypto.randomUUID()), enabled: true }] })}
                        >
                            <Plus />
                            เพิ่มกฎ {XP_SOURCE_LABELS[source]}
                        </Button>
                    ))}
                    <Button
                        variant="ghost"
                        onClick={async () => {
                            if (
                                await confirm({
                                    title: 'คืนการตั้งค่า XP เริ่มต้น?',
                                    description: 'แทนที่กฎที่กำลังแก้ โดยคง XP ของสมาชิกไว้ และยังต้องกดบันทึกทั้งหมด',
                                    destructive: true,
                                })
                            ) {
                                setDraft(defaultXpSettings());
                                setCommandText({});
                            }
                        }}
                    >
                        คืนค่าเริ่มต้น
                    </Button>
                </div>
            </fieldset>
            <Button disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate()}>
                <Save />
                บันทึกทั้งหมด
            </Button>
        </div>
    );
}
