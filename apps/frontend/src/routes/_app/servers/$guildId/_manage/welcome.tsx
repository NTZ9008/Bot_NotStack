import type { WelcomeCard, WelcomeVars } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useBlocker } from '@tanstack/react-router';
import { Copy, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { welcomeApi, welcomeAssetsQuery, welcomeCardsQuery, welcomeMetaQuery } from '@/api/welcome';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { UserPicker, type PickedUser } from '@/components/user-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorForm, type PatchDraft } from '@/features/welcome/editor-form';
import { WelcomePreview, type Handle } from '@/features/welcome/preview';
import { isDirty, pickDraft, type CardDraft, type Section } from '@/features/welcome/types';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useGuildId } from '@/hooks/use-guild';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/welcome')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(welcomeMetaQuery(params.guildId)),
            context.queryClient.ensureQueryData(welcomeCardsQuery(params.guildId)),
            context.queryClient.ensureQueryData(welcomeAssetsQuery(params.guildId)),
        ]),
    component: WelcomePage,
});

const SECTIONS: { value: Section; label: string }[] = [
    { value: 'general', label: 'ทั่วไป' },
    { value: 'background', label: 'พื้นหลัง' },
    { value: 'avatar', label: 'รูปโปรไฟล์' },
    { value: 'texts', label: 'ข้อความบนรูป' },
];

const toDraft = (card: WelcomeCard): CardDraft => structuredClone({ ...pickDraft(card), id: card.id, enabled: card.enabled });

// ==========================================
// 🎉 WELCOME ANNOUNCEMENT — การ์ดต้อนรับแบบรูปภาพ
// - รายการการ์ด: สร้าง / คัดลอก / ลบ / เปิด-ปิด (สวิตช์เปิด-ปิดบันทึกทันที)
// - ตัวแก้ไข 4 หมวด แก้แล้วกด "บันทึก" (Ctrl/⌘ + S) — ออกจากหน้า/สลับการ์ดตอนมีการแก้ค้างจะถามก่อน
// ==========================================
function WelcomePage() {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const meta = useQuery(welcomeMetaQuery(guildId));
    const cards = useQuery(welcomeCardsQuery(guildId));
    const assets = useQuery(welcomeAssetsQuery(guildId));
    const { data: allChannels = [] } = useQuery(guildChannelsQuery(guildId));
    const { data: roles = [] } = useQuery(guildRolesQuery(guildId));
    const channels = allChannels.filter((ch) => ch.sendable);

    const [saved, setSaved] = useState<CardDraft | null>(null);
    const [draft, setDraft] = useState<CardDraft | null>(null);
    const [section, setSection] = useState<Section>('general');
    const [openText, setOpenText] = useState(0);
    const [sample, setSample] = useState<PickedUser | null>(null);
    const [vars, setVars] = useState<WelcomeVars | null>(null);
    const [busy, setBusy] = useState<'save' | 'test' | null>(null);
    const dirty = isDirty(draft, saved);

    const patch = useCallback<PatchDraft>((mutate) => {
        setDraft((current) => {
            if (!current) return current;
            const next = structuredClone(current);
            mutate(next);
            return next;
        });
    }, []);

    const setCards = (update: (list: WelcomeCard[]) => WelcomeCard[]) => queryClient.setQueryData<WelcomeCard[]>(welcomeCardsQuery(guildId).queryKey, (list = []) => update(list));

    const load = (card: WelcomeCard | undefined) => {
        setSaved(card ? toDraft(card) : null);
        setDraft(card ? toDraft(card) : null);
        setOpenText(card?.design.texts.length ? 0 : -1);
    };

    // เปิดหน้ามาครั้งแรก → เลือกการ์ดใบแรกให้
    useEffect(() => {
        if (!saved && cards.data?.length) load(cards.data[0]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cards.data]);

    const confirmDiscard = async () =>
        !dirty ||
        confirm({
            title: 'ทิ้งการแก้ไขที่ยังไม่บันทึก?',
            description: `การ์ด "${draft?.name}" มีการแก้ไขที่ยังไม่ได้กดบันทึก`,
            confirmText: 'ทิ้งการแก้ไข',
            destructive: true,
        });

    // ออกจากหน้านี้ (หรือปิดแท็บ) ตอนมีการแก้ไขค้างอยู่ → ถามก่อน
    useBlocker({
        shouldBlockFn: async () => !(await confirmDiscard()),
        enableBeforeUnload: () => dirty,
    });

    const select = async (id: number) => {
        if (id === draft?.id || !(await confirmDiscard())) return;
        load(cards.data?.find((card) => card.id === id));
    };

    const save = async () => {
        if (!draft || !dirty) return;
        if (!draft.name.trim()) return toast.error('บันทึกไม่ได้', { description: 'กรุณาตั้งชื่อการ์ด' });
        setBusy('save');
        try {
            const { card, warning } = await welcomeApi.updateCard(guildId, draft.id, pickDraft(draft));
            setCards((list) => list.map((c) => (c.id === card.id ? card : c)));
            // ใช้ค่าที่ server ตรวจแล้ว (อาจถูกบีบให้อยู่ในช่วงที่อนุญาต)
            load(card);
            if (warning) toast.warning('บันทึกแล้ว แต่ยังส่งการ์ดไม่ได้', { description: warning });
            else toast.success('บันทึกการ์ดแล้ว');
        } catch (err) {
            toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    // Ctrl/⌘ + S = บันทึก
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                void save();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    });

    // เปิด/ปิดบันทึกทันที (ทั้งสวิตช์ในรายการและบนหัวตัวแก้ไข) — ไม่กระทบการแก้ไขอื่นที่ค้างอยู่
    const toggle = async (card: WelcomeCard, enabled: boolean) => {
        if (enabled && !card.channelId) return toast.error('ยังเปิดใช้งานไม่ได้', { description: 'เลือกห้องที่จะส่งแล้วกด "บันทึก" ก่อนเปิดใช้งาน' });
        try {
            const { card: updated, warning } = await welcomeApi.updateCard(guildId, card.id, { enabled });
            setCards((list) => list.map((c) => (c.id === updated.id ? { ...c, enabled: updated.enabled } : c)));
            if (updated.id === draft?.id) {
                setSaved((s) => s && { ...s, enabled: updated.enabled });
                setDraft((d) => d && { ...d, enabled: updated.enabled });
            }
            if (warning) toast.warning('เปิดใช้งานแล้ว แต่ยังส่งการ์ดไม่ได้', { description: warning });
            else toast.success(enabled ? 'เปิดใช้งานการ์ดแล้ว' : 'ปิดการ์ดแล้ว');
        } catch (err) {
            toast.error('เปลี่ยนสถานะไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const create = async (duplicateOf?: number) => {
        if (!(await confirmDiscard())) return;
        try {
            const { card } = await welcomeApi.createCard(guildId, duplicateOf ? { duplicateOf } : {});
            setCards((list) => [...list, card]);
            load(card);
            toast.success(duplicateOf ? 'คัดลอกการ์ดแล้ว' : 'สร้างการ์ดใหม่แล้ว', { description: 'การ์ดใหม่ปิดอยู่ — ตั้งค่าเสร็จแล้วค่อยเปิดใช้งาน' });
        } catch (err) {
            toast.error('สร้างการ์ดไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const remove = async () => {
        if (!draft) return;
        const ok = await confirm({ title: `ลบการ์ด "${saved?.name}"?`, description: 'ลบแล้วกู้คืนไม่ได้ (รูปในคลังรูปยังอยู่)', confirmText: 'ลบการ์ด', destructive: true });
        if (!ok) return;
        try {
            await welcomeApi.deleteCard(guildId, draft.id);
            const rest = (cards.data ?? []).filter((c) => c.id !== draft.id);
            setCards(() => rest);
            load(rest[0]);
            toast.success('ลบการ์ดแล้ว');
        } catch (err) {
            toast.error('ลบการ์ดไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const testSend = async () => {
        if (!draft) return;
        if (!draft.channelId) return toast.error('ยังส่งทดสอบไม่ได้', { description: 'กรุณาเลือกห้องที่จะส่งในหมวด "ทั่วไป" ก่อน' });
        const ok = await confirm({
            title: `ส่งการ์ดทดสอบเข้า ${channelLabel(channels, draft.channelId)}?`,
            description: `ใช้ค่าที่กำลังแก้อยู่ตอนนี้ (แม้ยังไม่บันทึก) โดยใช้ ${vars?.user ?? 'บัญชีของคุณ'} เป็นสมาชิกตัวอย่าง — สมาชิกในห้องนั้นจะเห็นข้อความนี้`,
            confirmText: 'ส่งทดสอบ',
        });
        if (!ok) return;
        setBusy('test');
        try {
            const result = await welcomeApi.test(guildId, {
                channelId: draft.channelId,
                content: draft.content,
                design: draft.design,
                backgroundId: draft.backgroundId,
                userId: sample?.userId ?? null,
            });
            toast.success('ส่งทดสอบแล้ว', { description: result.message });
        } catch (err) {
            toast.error('ส่งทดสอบไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    // คลิกจุดบนรูปตัวอย่าง = เปิดการตั้งค่าขององค์ประกอบนั้น
    const focusElement = useCallback((handle: Handle) => {
        if (handle === 'avatar') setSection('avatar');
        else {
            setSection('texts');
            setOpenText(handle);
        }
    }, []);

    // รูปที่ถูกลบออกจากคลัง → การ์ดที่ใช้รูปนั้นกลับไปใช้สีพื้น (server ตั้งให้แล้ว) ทำให้ข้อมูลในหน้าเว็บตรงกัน
    const onAssetDeleted = (assetId: number) => {
        setSaved((s) => (s?.backgroundId === assetId ? { ...s, backgroundId: null } : s));
        setDraft((d) => (d?.backgroundId === assetId ? { ...d, backgroundId: null } : d));
    };

    if (meta.isLoading || cards.isLoading || assets.isLoading) return <LoadingState />;
    if (meta.error || cards.error || assets.error) return <ErrorState error={meta.error ?? cards.error ?? assets.error} title="โหลดข้อมูล Welcome ไม่สำเร็จ" />;
    const cardList = cards.data ?? [];
    const current = cardList.find((c) => c.id === draft?.id);

    return (
        <>
            <PageHeader
                title="Welcome Announcement"
                description="การ์ดต้อนรับสมาชิกใหม่แบบรูปภาพ — ใส่รูปพื้นหลัง รูปโปรไฟล์ ชื่อ และข้อความ แล้วเลือกห้องที่จะส่ง"
                actions={
                    <Button onClick={() => void create()}>
                        <Plus /> สร้างการ์ดใหม่
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>การ์ดต้อนรับ</CardTitle>
                    <CardDescription>เปิดได้หลายใบพร้อมกัน — สมาชิกใหม่ 1 คนจะได้ทุกใบที่เปิดอยู่ ส่งเข้าห้องของแต่ละใบ (ทำงานแยกจากข้อความ Welcome เดิม)</CardDescription>
                </CardHeader>
                <CardContent>
                    {cardList.length === 0 ? (
                        <EmptyState>ยังไม่มีการ์ดต้อนรับ — กด "สร้างการ์ดใหม่" เพื่อเริ่มออกแบบ</EmptyState>
                    ) : (
                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                            {cardList.map((card) => (
                                <div
                                    key={card.id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => void select(card.id)}
                                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && void select(card.id)}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/60',
                                        card.id === draft?.id && 'border-primary bg-primary/10',
                                    )}
                                >
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-medium">{card.name}</p>
                                        <p className="truncate text-xs">
                                            {card.channelId ? (
                                                <span className="text-muted-foreground">{channelLabel(allChannels, card.channelId)}</span>
                                            ) : (
                                                <span className="text-amber-400">ยังไม่ได้เลือกห้อง</span>
                                            )}
                                        </p>
                                    </div>
                                    <Badge variant={card.enabled ? 'default' : 'secondary'}>{card.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</Badge>
                                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                        <Switch checked={card.enabled} onCheckedChange={(checked) => void toggle(card, checked)} title="เปิด/ปิดการ์ดนี้ (บันทึกทันที)" />
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {draft && meta.data && current && (
                <Card>
                    <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <CardTitle className="truncate text-lg">{draft.name || '(ไม่มีชื่อ)'}</CardTitle>
                            {dirty && <Badge className="bg-amber-500/15 text-amber-300">มีการแก้ไขที่ยังไม่บันทึก</Badge>}
                        </div>
                        <Label className="flex items-center gap-2" title="เปิด/ปิดการ์ดนี้ (บันทึกทันที)">
                            เปิดใช้งาน
                            <Switch checked={draft.enabled} onCheckedChange={(checked) => void toggle(current, checked)} />
                        </Label>
                    </CardHeader>
                    <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                        <div className="space-y-4">
                            <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
                                <TabsList className="w-full">
                                    {SECTIONS.map((s) => (
                                        <TabsTrigger key={s.value} value={s.value} className="flex-1">
                                            {s.label}
                                        </TabsTrigger>
                                    ))}
                                </TabsList>
                            </Tabs>
                            <EditorForm
                                section={section}
                                meta={meta.data}
                                draft={draft}
                                patch={patch}
                                channels={channels}
                                assets={assets.data ?? []}
                                cards={cardList}
                                openText={openText}
                                setOpenText={setOpenText}
                                onAssetDeleted={onAssetDeleted}
                            />
                        </div>

                        <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
                            <p className="text-sm text-muted-foreground">ตัวอย่างใน Discord — ลากรูปโปรไฟล์หรือจุดตัวเลขบนรูปเพื่อย้ายตำแหน่ง</p>
                            <WelcomePreview
                                draft={draft}
                                patch={patch}
                                sampleUserId={sample?.userId ?? null}
                                bot={meta.data.bot}
                                roles={roles}
                                channels={allChannels}
                                onVars={setVars}
                                onFocusElement={focusElement}
                            />
                            <Field label="ดูตัวอย่างในนาม" hint="ค่าเริ่มต้นคือบัญชี Discord ของคุณ (หรือตัวบอท ถ้ายังไม่ได้เชื่อม Discord)">
                                <UserPicker
                                    value={sample}
                                    onSelect={setSample}
                                    onClear={() => setSample(null)}
                                    placeholder="พิมพ์ชื่อสมาชิกเพื่อดูตัวอย่างในนามคนนั้น..."
                                />
                            </Field>
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => void save()} disabled={!dirty || busy === 'save'} title="Ctrl/⌘ + S">
                                    {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} บันทึก
                                </Button>
                                <Button variant="outline" disabled={!dirty} onClick={() => saved && setDraft(structuredClone(saved))}>
                                    <RotateCcw /> ยกเลิกการแก้ไข
                                </Button>
                                <Button variant="secondary" className="text-amber-300" onClick={() => void testSend()} disabled={busy === 'test'}>
                                    {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />} ส่งทดสอบ
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => void create(draft.id)}>
                                    <Copy /> คัดลอกการ์ดนี้
                                </Button>
                                <Button variant="destructive" onClick={() => void remove()}>
                                    <Trash2 /> ลบการ์ด
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </>
    );
}
