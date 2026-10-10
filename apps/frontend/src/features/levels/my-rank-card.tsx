import type { MyRankCardResponse, RankBackgroundType, RankCardMeta, RankMemberStyle, RankPreviewKind } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBlocker } from '@tanstack/react-router';
import { Check, Info, RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { memberBackgroundUrl, myRankCardQuery, rankCardApi, rankCardKey, rankMetaQuery } from '@/api/rank-card';
import { ColorField } from '@/components/color-field';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { ErrorState, LoadingState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Segmented } from '@/features/welcome/form-controls';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RankPreview } from './rank-preview';
import { LayoutPicker } from './rank-theme-editor';

type BackgroundChoice = 'theme' | Exclude<RankBackgroundType, 'image'> | 'image';

export function MyRankCardPanel({ guildId }: { guildId: string }) {
    const meta = useQuery(rankMetaQuery(guildId));
    const mine = useQuery(myRankCardQuery(guildId));
    if (meta.error || mine.error) return <ErrorState error={meta.error ?? mine.error} />;
    if (!meta.data || !mine.data) return <LoadingState />;
    if (!mine.data.available) {
        return (
            <Card>
                <CardContent className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Info className="mt-0.5 size-4 shrink-0" />
                    {mine.data.reason ?? 'ยังแต่งการ์ดไม่ได้'}
                </CardContent>
            </Card>
        );
    }
    return <MyCardEditor key={guildId} guildId={guildId} meta={meta.data} initial={mine.data} />;
}

function MyCardEditor({ guildId, meta, initial }: { guildId: string; meta: RankCardMeta; initial: MyRankCardResponse }) {
    const client = useQueryClient();
    const confirm = useConfirm();
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState<RankMemberStyle>(initial.style);
    const [kind, setKind] = useState<RankPreviewKind>('rank');
    const { permissions: rules, themeStyle } = saved;
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved.style);

    const background: BackgroundChoice = draft.background ? draft.background.type : 'theme';
    const backgroundOptions: Partial<Record<BackgroundChoice, string>> = {
        theme: 'ของเซิร์ฟเวอร์',
        ...(rules.colors ? { color: 'สีเดียว', gradient: 'ไล่สี' } : {}),
        ...(rules.backgrounds && rules.backgroundIds.length ? { image: 'รูป' } : {}),
    };

    useBlocker({
        shouldBlockFn: async () => dirty && !(await confirm({ title: 'ทิ้งการแก้ไขการ์ดที่ยังไม่บันทึก?', destructive: true })),
        enableBeforeUnload: () => dirty,
    });

    const apply = (data: MyRankCardResponse, message: string) => {
        setSaved(data);
        setDraft(data.style);
        client.setQueryData(myRankCardQuery(guildId).queryKey, data);
        toast.success(message);
    };
    const save = useMutation({
        mutationFn: () => rankCardApi.saveMine(guildId, draft),
        onSuccess: (data) => apply(data, 'บันทึกการ์ดของคุณแล้ว'),
        onError: (err) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const reset = useMutation({
        mutationFn: () => rankCardApi.resetMine(guildId),
        onSuccess: (data) => apply(data, 'กลับไปใช้ธีมของเซิร์ฟเวอร์แล้ว'),
        onError: (err) => toast.error('รีเซ็ตไม่สำเร็จ', { description: errorMessage(err) }),
    });
    const busy = save.isPending || reset.isPending;

    const setBackground = (choice: BackgroundChoice) =>
        setDraft(({ background: _old, ...rest }) => {
            if (choice === 'theme') return rest;
            const base = { color: themeStyle.background.color, color2: themeStyle.background.color2 };
            if (choice === 'image') return { ...rest, background: { type: 'image', ...base, imageId: rules.backgroundIds[0] ?? null } };
            return { ...rest, background: { type: choice, ...base, imageId: null } };
        });
    const unset = (key: 'accentColor' | 'textColor') =>
        setDraft((old) => {
            const next = { ...old };
            delete next[key];
            return next;
        });

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">การ์ดของคุณในเซิร์ฟเวอร์นี้ — แสดงเมื่อใช้ /rank และตอนประกาศเลเวลอัป (แต่งใน Discord ได้ด้วย /rankcard)</p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        disabled={busy || !Object.keys(saved.style).length}
                        onClick={async () => {
                            if (await confirm({ title: 'กลับไปใช้ธีมของเซิร์ฟเวอร์?', description: 'ค่าที่แต่งไว้ทั้งหมดจะถูกลบ' })) reset.mutate();
                        }}
                    >
                        <RotateCcw />
                        ใช้ธีมของเซิร์ฟเวอร์
                    </Button>
                    <Button disabled={!dirty || busy} onClick={() => save.mutate()}>
                        <Save />
                        {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
                    </Button>
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <fieldset disabled={busy} className="min-w-0 space-y-5">
                    {rules.layout && (
                        <Card>
                            <CardHeader>
                                <CardTitle>แบบการ์ด</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <LayoutPicker meta={meta} value={draft.layout ?? themeStyle.layout} onChange={(layout) => setDraft((old) => ({ ...old, layout }))} />
                            </CardContent>
                        </Card>
                    )}

                    {rules.colors && (
                        <Card>
                            <CardHeader>
                                <CardTitle>สี</CardTitle>
                                <CardDescription>ไม่ตั้ง = ใช้สีของธีมเซิร์ฟเวอร์</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Field label="สีหลัก" hint="หลอด XP / ตัวเลขเลเวล / ขอบรูปโปรไฟล์">
                                    <div className="flex flex-wrap gap-1.5 pb-1">
                                        {meta.colorPresets.map((preset) => (
                                            <button
                                                key={preset.value}
                                                type="button"
                                                title={preset.name}
                                                aria-label={preset.name}
                                                onClick={() => setDraft((old) => ({ ...old, accentColor: preset.value }))}
                                                className={cn('size-7 rounded-full border-2', (draft.accentColor ?? themeStyle.accentColor) === preset.value ? 'border-foreground' : 'border-transparent')}
                                                style={{ background: preset.value }}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <ColorField className="flex-1" value={draft.accentColor ?? themeStyle.accentColor} onChange={(accentColor) => setDraft((old) => ({ ...old, accentColor }))} />
                                        {draft.accentColor && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => unset('accentColor')}>
                                                ใช้ของธีม
                                            </Button>
                                        )}
                                    </div>
                                </Field>
                                <Field label="สีตัวอักษร">
                                    <div className="flex gap-2">
                                        <ColorField className="flex-1" value={draft.textColor ?? themeStyle.textColor} onChange={(textColor) => setDraft((old) => ({ ...old, textColor }))} />
                                        {draft.textColor && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => unset('textColor')}>
                                                ใช้ของธีม
                                            </Button>
                                        )}
                                    </div>
                                </Field>
                            </CardContent>
                        </Card>
                    )}

                    {Object.keys(backgroundOptions).length > 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>พื้นหลัง</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Segmented value={background} options={backgroundOptions as Record<BackgroundChoice, string>} onChange={setBackground} />
                                {draft.background && draft.background.type !== 'image' && (
                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <Field label={draft.background.type === 'gradient' ? 'สีเริ่มต้น' : 'สีพื้น'}>
                                            <ColorField
                                                value={draft.background.color}
                                                onChange={(color) => setDraft((old) => ({ ...old, background: { ...old.background!, color } }))}
                                            />
                                        </Field>
                                        {draft.background.type === 'gradient' && (
                                            <Field label="สีปลายทาง">
                                                <ColorField
                                                    value={draft.background.color2}
                                                    onChange={(color2) => setDraft((old) => ({ ...old, background: { ...old.background!, color2 } }))}
                                                />
                                            </Field>
                                        )}
                                    </div>
                                )}
                                {draft.background?.type === 'image' && (
                                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                        {rules.backgroundIds.map((id) => {
                                            const on = draft.background?.imageId === id;
                                            return (
                                                <button
                                                    key={id}
                                                    type="button"
                                                    onClick={() => setDraft((old) => ({ ...old, background: { ...old.background!, type: 'image', imageId: id } }))}
                                                    className={cn('relative overflow-hidden rounded-md border', on ? 'border-primary ring-2 ring-primary/40' : 'opacity-70 hover:opacity-100')}
                                                >
                                                    <img src={memberBackgroundUrl(guildId, id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                                                    {on && <Check className="absolute top-1 right-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {!rules.layout && !rules.colors && Object.keys(backgroundOptions).length <= 1 && (
                        <Card>
                            <CardContent className="text-sm text-muted-foreground">แอดมินยังไม่ได้เปิดให้แต่งส่วนใดของการ์ด</CardContent>
                        </Card>
                    )}
                </fieldset>

                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                    <RankPreview
                        queryKey={[...rankCardKey(guildId), 'me']}
                        input={draft}
                        fetcher={(style, signal) => rankCardApi.previewMine(guildId, { kind, style }, signal)}
                        kind={kind}
                        kinds={['rank', 'levelup']}
                        onKind={setKind}
                    />
                </div>
            </div>
        </div>
    );
}
