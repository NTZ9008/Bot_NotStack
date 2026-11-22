import { tr, byLang } from '../../../../../lib/i18n';
import type { WelcomeCard, WelcomeVars } from '@notstack/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Copy, Loader2, Plus, RotateCcw, Save, Send, Trash2 } from '@/components/icons';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { guildChannelsQuery, guildRolesQuery } from '@/api/guilds';
import { welcomeApi, welcomeAssetsQuery, welcomeCardsQuery, welcomeMetaQuery } from '@/api/welcome';
import { channelLabel } from '@/components/channel-select';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { WelcomePageSkeleton } from '@/components/skeleton/editor-pages';
import { EmptyState, ErrorState } from '@/components/states';
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
import { useSaveShortcut, useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/welcome')({
    loader: ({ context, params }) =>
        Promise.all([
            context.queryClient.ensureQueryData(guildChannelsQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(guildRolesQuery(params.guildId)).catch(() => undefined),
            context.queryClient.ensureQueryData(welcomeMetaQuery(params.guildId)),
            context.queryClient.ensureQueryData(welcomeCardsQuery(params.guildId)),
            context.queryClient.ensureQueryData(welcomeAssetsQuery(params.guildId)),
        ]),
    component: WelcomePage,
});

const SECTIONS = byLang((): { value: Section; label: string }[] => [
    { value: 'general', label: tr('welcome.general') },
    { value: 'background', label: tr('common.background') },
    { value: 'avatar', label: tr('common.avatar') },
    { value: 'texts', label: tr('welcome.textOnImage') },
]);

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

    const setCards = (update: (list: WelcomeCard[]) => WelcomeCard[]) =>
        queryClient.setQueryData<WelcomeCard[]>(welcomeCardsQuery(guildId).queryKey, (list = []) => update(list));

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

    const discardDialog = {
        title: tr('common.discardUnsavedChanges'),
        description: tr('welcome.cardHasUnsavedChanges', { 0: draft?.name }),
        confirmText: tr('common.discardChanges'),
        destructive: true,
    };
    const confirmDiscard = async () => !dirty || confirm(discardDialog);

    // ออกจากหน้านี้ (หรือปิดแท็บ) ตอนมีการแก้ไขค้างอยู่ → ถามก่อน
    useUnsavedChangesGuard(dirty, discardDialog);

    const select = async (id: number) => {
        if (id === draft?.id || !(await confirmDiscard())) return;
        load(cards.data?.find((card) => card.id === id));
    };

    const save = async () => {
        if (!draft || !dirty) return;
        if (!draft.name.trim()) return toast.error(tr('welcome.cantSave'), { description: tr('welcome.pleaseGiveTheCardAName') });
        setBusy('save');
        try {
            const { card, warning } = await welcomeApi.updateCard(guildId, draft.id, pickDraft(draft));
            setCards((list) => list.map((c) => (c.id === card.id ? card : c)));
            // ใช้ค่าที่ server ตรวจแล้ว (อาจถูกบีบให้อยู่ในช่วงที่อนุญาต)
            load(card);
            if (warning) toast.warning(tr('welcome.savedButTheCardCantBe'), { description: warning });
            else toast.success(tr('welcome.cardSaved'));
        } catch (err) {
            toast.error(tr('common.saveFailed'), { description: errorMessage(err) });
        } finally {
            setBusy(null);
        }
    };

    useSaveShortcut(() => void save());

    // เปิด/ปิดบันทึกทันที (ทั้งสวิตช์ในรายการและบนหัวตัวแก้ไข) — ไม่กระทบการแก้ไขอื่นที่ค้างอยู่
    const toggle = async (card: WelcomeCard, enabled: boolean) => {
        if (enabled && !card.channelId) return toast.error(tr('common.cantEnableYet'), { description: tr('common.pickAChannelAndPressSave') });
        try {
            const { card: updated, warning } = await welcomeApi.updateCard(guildId, card.id, { enabled });
            setCards((list) => list.map((c) => (c.id === updated.id ? { ...c, enabled: updated.enabled } : c)));
            if (updated.id === draft?.id) {
                setSaved((s) => s && { ...s, enabled: updated.enabled });
                setDraft((d) => d && { ...d, enabled: updated.enabled });
            }
            if (warning) toast.warning(tr('welcome.enabledButTheCardCantBe'), { description: warning });
            else toast.success(enabled ? tr('welcome.cardEnabled') : tr('welcome.cardDisabled'));
        } catch (err) {
            toast.error(tr('common.failedToChangeStatus'), { description: errorMessage(err) });
        }
    };

    const create = async (duplicateOf?: number) => {
        if (!(await confirmDiscard())) return;
        try {
            const { card } = await welcomeApi.createCard(guildId, duplicateOf ? { duplicateOf } : {});
            setCards((list) => [...list, card]);
            load(card);
            toast.success(duplicateOf ? tr('welcome.cardCopied') : tr('welcome.newCardCreated'), {
                description: tr('welcome.newCardsStartOffEnableIt'),
            });
        } catch (err) {
            toast.error(tr('welcome.failedToCreateCard'), { description: errorMessage(err) });
        }
    };

    const remove = async () => {
        if (!draft) return;
        const ok = await confirm({
            title: tr('welcome.deleteCard2', { 0: saved?.name }),
            description: tr('welcome.cantBeUndoneImagesInThe'),
            confirmText: tr('welcome.deleteCard'),
            destructive: true,
        });
        if (!ok) return;
        try {
            await welcomeApi.deleteCard(guildId, draft.id);
            const rest = (cards.data ?? []).filter((c) => c.id !== draft.id);
            setCards(() => rest);
            load(rest[0]);
            toast.success(tr('welcome.cardDeleted'));
        } catch (err) {
            toast.error(tr('welcome.failedToDeleteCard'), { description: errorMessage(err) });
        }
    };

    const testSend = async () => {
        if (!draft) return;
        if (!draft.channelId) return toast.error(tr('common.cantSendATestYet'), { description: tr('welcome.pleasePickAChannelInGeneral') });
        const ok = await confirm({
            title: tr('welcome.sendATestCardTo', { 0: channelLabel(channels, draft.channelId) }),
            description: tr('welcome.usesTheValuesYoureEditingNow', {
                0: vars?.user ?? 'บัญชีของคุณ',
            }),
            confirmText: tr('common.sendTest'),
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
            toast.success(tr('common.testSent'), { description: result.message });
        } catch (err) {
            toast.error(tr('common.failedToSendTest'), { description: errorMessage(err) });
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

    if (meta.isLoading || cards.isLoading || assets.isLoading) return <WelcomePageSkeleton />;
    if (meta.error || cards.error || assets.error)
        return <ErrorState error={meta.error ?? cards.error ?? assets.error} title={tr('welcome.failedToLoadWelcomeData')} />;
    const cardList = cards.data ?? [];
    const current = cardList.find((c) => c.id === draft?.id);

    return (
        <>
            <PageHeader
                help="welcome"
                title={tr('common.welcomeNewMembers')}
                description={tr('welcome.imageWelcomeCardsForNewMembers')}
                actions={
                    <Button onClick={() => void create()}>
                        <Plus /> {tr('welcome.createNewCard')}
                    </Button>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle>{tr('welcome.welcomeCards')}</CardTitle>
                    <CardDescription>{tr('welcome.severalCanBeOnAtOnce')}</CardDescription>
                </CardHeader>
                <CardContent>
                    {cardList.length === 0 ? (
                        <EmptyState>{tr('welcome.noWelcomeCardsYetPressCreate')}</EmptyState>
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
                                                <span className="text-amber-700 dark:text-amber-400">{tr('common.noChannelSelected')}</span>
                                            )}
                                        </p>
                                    </div>
                                    <Badge variant={card.enabled ? 'default' : 'secondary'}>{card.enabled ? tr('common.on') : tr('common.off')}</Badge>
                                    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                                        <Switch
                                            checked={card.enabled}
                                            onCheckedChange={(checked) => void toggle(card, checked)}
                                            title={tr('welcome.turnThisCardOnOffSaved')}
                                        />
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
                            <CardTitle className="truncate text-lg">{draft.name || tr('welcome.untitled')}</CardTitle>
                            {dirty && <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">{tr('common.youHaveUnsavedChanges')}</Badge>}
                        </div>
                        <Label className="flex items-center gap-2" title={tr('welcome.turnThisCardOnOffSaved')}>
                            {tr('common.enabled')}
                            <Switch checked={draft.enabled} onCheckedChange={(checked) => void toggle(current, checked)} />
                        </Label>
                    </CardHeader>
                    <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
                        <div className="space-y-4">
                            <Tabs value={section} onValueChange={(value) => setSection(value as Section)}>
                                <TabsList className="w-full">
                                    {SECTIONS().map((s) => (
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
                            <p className="text-sm text-muted-foreground">{tr('welcome.discordPreviewDragTheAvatarOr')}</p>
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
                            <Field label={tr('welcome.previewAs')} hint={tr('welcome.defaultsToYourDiscordAccountOr')}>
                                <UserPicker
                                    value={sample}
                                    onSelect={setSample}
                                    onClear={() => setSample(null)}
                                    placeholder={tr('welcome.typeAMemberNameToPreview')}
                                />
                            </Field>
                            <div className="flex flex-wrap gap-2">
                                <Button onClick={() => void save()} disabled={!dirty || busy === 'save'} title="Ctrl/⌘ + S">
                                    {busy === 'save' ? <Loader2 className="animate-spin" /> : <Save />} {tr('common.save')}
                                </Button>
                                <Button variant="outline" disabled={!dirty} onClick={() => saved && setDraft(structuredClone(saved))}>
                                    <RotateCcw /> {tr('common.cancelChanges')}
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="text-amber-700 dark:text-amber-300"
                                    onClick={() => void testSend()}
                                    disabled={busy === 'test'}
                                >
                                    {busy === 'test' ? <Loader2 className="animate-spin" /> : <Send />} {tr('common.sendTest')}
                                </Button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => void create(draft.id)}>
                                    <Copy /> {tr('welcome.copyThisCard')}
                                </Button>
                                <Button variant="destructive" onClick={() => void remove()}>
                                    <Trash2 /> {tr('welcome.deleteCard')}
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </>
    );
}
