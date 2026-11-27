import { tr, byLang } from '../../lib/i18n';
import { NativeSelect } from '@/components/ui/native-select';
import type { RankBackgroundType, RankCardMeta, RankCardStyle, RankCardTheme, RankPreviewKind, WelcomeAsset, WelcomeCard, WelcomeMeta } from '@notstack/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RotateCcw } from '@/components/icons';
import { useState } from 'react';
import { toast } from 'sonner';
import { rankCardApi, rankCardKey, rankMetaQuery, rankThemeQuery } from '@/api/rank-card';
import { assetImageUrl, welcomeAssetsQuery, welcomeCardsQuery, welcomeMetaQuery } from '@/api/welcome';
import { ColorField } from '@/components/color-field';
import { useConfirm } from '@/components/confirm-dialog';
import { SaveBar } from '@/components/page-controls';
import { Field } from '@/components/field';
import { RankEditorSkeleton } from '@/components/skeleton/levels';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AssetGallery } from '@/features/welcome/asset-gallery';
import { RangeField, Segmented, SwitchRow } from '@/features/welcome/form-controls';
import { SHAPE_LABELS } from '@/features/welcome/types';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { RankPreview } from './rank-preview';

export const BACKGROUND_LABELS = byLang((): Record<RankBackgroundType, string> => ({
    color: tr('levels.solid'),
    gradient: tr('levels.gradient'),
    image: tr('levels.imageFromLibrary'),
}));
const SHOW_LABELS = byLang((): Record<keyof RankCardStyle['show'], string> => ({
    rank: tr('levels.rankRank'),
    level: tr('levels.levelLevel'),
    xpText: tr('levels.xpNumbers'),
    username: '@username',
    serverName: tr('levels.serverName'),
}));

// การ์ดเลือกแบบ (layout) — ใช้ทั้งหน้าธีมและหน้าการ์ดของฉัน
export function LayoutPicker({ meta, value, onChange }: { meta: RankCardMeta; value: string; onChange: (layout: RankCardStyle['layout']) => void }) {
    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {meta.layouts.map((layout) => {
                const size = meta.sizes[layout];
                return (
                    <button
                        key={layout}
                        type="button"
                        onClick={() => onChange(layout)}
                        className={cn(
                            'flex flex-col gap-2 rounded-lg border p-3 text-left text-sm transition-colors hover:border-primary/60',
                            value === layout && 'border-primary ring-2 ring-primary/40',
                        )}
                    >
                        <span
                            className="block w-full rounded bg-gradient-to-br from-indigo-500/40 to-violet-500/20"
                            style={{ aspectRatio: `${size.width} / ${size.height}` }}
                        />
                        <span className="flex items-center justify-between gap-2 font-medium">
                            {meta.layoutLabels[layout].split(' — ')[0]}
                            {value === layout && <Check className="size-4 text-primary" />}
                        </span>
                        <span className="text-xs text-muted-foreground">{meta.layoutLabels[layout].split(' — ')[1]}</span>
                    </button>
                );
            })}
        </div>
    );
}

export function RankThemePanel({ guildId }: { guildId: string }) {
    const meta = useQuery(rankMetaQuery(guildId));
    const theme = useQuery(rankThemeQuery(guildId));
    const welcomeMeta = useQuery(welcomeMetaQuery(guildId));
    const assets = useQuery(welcomeAssetsQuery(guildId));
    const cards = useQuery(welcomeCardsQuery(guildId));
    const queries = [meta, theme, welcomeMeta, assets, cards];
    const failed = queries.find((q) => q.error);
    if (failed) return <ErrorState error={failed.error} />;
    if (!meta.data || !theme.data || !welcomeMeta.data || !assets.data || !cards.data) return <RankEditorSkeleton />;
    return (
        <ThemeEditor
            key={guildId}
            guildId={guildId}
            meta={meta.data}
            initial={theme.data}
            welcomeMeta={welcomeMeta.data}
            assets={assets.data}
            welcomeCards={cards.data}
        />
    );
}

function ThemeEditor({
    guildId,
    meta,
    initial,
    welcomeMeta,
    assets,
    welcomeCards,
}: {
    guildId: string;
    meta: RankCardMeta;
    initial: RankCardTheme;
    welcomeMeta: WelcomeMeta;
    assets: WelcomeAsset[];
    welcomeCards: WelcomeCard[];
}) {
    const client = useQueryClient();
    const confirm = useConfirm();
    const [saved, setSaved] = useState(initial);
    const [draft, setDraft] = useState(initial);
    const [kind, setKind] = useState<RankPreviewKind>('rank');
    const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
    const style = draft.style;

    const patchStyle = (mutate: (s: RankCardStyle) => void) =>
        setDraft((old) => {
            const next = structuredClone(old);
            mutate(next.style);
            return next;
        });
    const patchMembers = (data: Partial<RankCardTheme['members']>) => setDraft((old) => ({ ...old, members: { ...old.members, ...data } }));

    useUnsavedChangesGuard(dirty, { title: tr('levels.discardUnsavedCardThemeChanges'), destructive: true });

    const save = useMutation({
        mutationFn: () => rankCardApi.saveTheme(guildId, draft),
        onSuccess: (data) => {
            setSaved(data);
            setDraft(data);
            client.setQueryData(rankThemeQuery(guildId).queryKey, data);
            void client.invalidateQueries({ queryKey: [...rankCardKey(guildId), 'me'] });
            toast.success(tr('levels.cardThemeSaved'), { description: tr('levels.rankLeaderboardAndLevelUpCards') });
        },
        onError: (err) => toast.error(tr('common.saveFailed'), { description: errorMessage(err) }),
    });

    const toggleMemberBackground = (id: number) =>
        patchMembers({
            backgroundIds: draft.members.backgroundIds.includes(id)
                ? draft.members.backgroundIds.filter((x) => x !== id)
                : [...draft.members.backgroundIds, id].slice(0, meta.limits.maxMemberBackgrounds),
        });

    return (
        <div className="space-y-5">
            <p className="text-sm text-muted-foreground">{tr('levels.theDefaultThemeForEveryCard')}</p>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <fieldset disabled={save.isPending} className="min-w-0 space-y-5">
                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.rankCardLayout')}</CardTitle>
                            <CardDescription>{tr('levels.theLeaderboardTableAndLevelUp')}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <LayoutPicker meta={meta} value={style.layout} onChange={(layout) => patchStyle((s) => void (s.layout = layout))} />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('common.background')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Segmented
                                value={style.background.type}
                                options={BACKGROUND_LABELS()}
                                onChange={(type) =>
                                    patchStyle((s) => void (s.background.type = type === 'image' && !s.background.imageId && !assets.length ? 'color' : type))
                                }
                            />
                            {style.background.type !== 'image' && (
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field label={style.background.type === 'gradient' ? tr('levels.startColor') : tr('common.backgroundColor')}>
                                        <ColorField value={style.background.color} onChange={(color) => patchStyle((s) => void (s.background.color = color))} />
                                    </Field>
                                    {style.background.type === 'gradient' && (
                                        <Field label={tr('levels.endColor')}>
                                            <ColorField
                                                value={style.background.color2}
                                                onChange={(color) => patchStyle((s) => void (s.background.color2 = color))}
                                            />
                                        </Field>
                                    )}
                                </div>
                            )}
                            {style.background.type === 'gradient' && (
                                <RangeField
                                    label={tr('levels.gradientDirection')}
                                    unit="°"
                                    min={0}
                                    max={359}
                                    value={style.background.angle}
                                    onChange={(angle) => patchStyle((s) => void (s.background.angle = angle))}
                                />
                            )}
                            {style.background.type === 'image' && (
                                <>
                                    <AssetGallery
                                        meta={welcomeMeta}
                                        assets={assets}
                                        cards={welcomeCards}
                                        selectedId={style.background.imageId}
                                        backgroundColor={style.background.color}
                                        onSelect={(id) =>
                                            patchStyle((s) => {
                                                s.background.imageId = id;
                                                if (!id) s.background.type = 'color';
                                            })
                                        }
                                        onDeleted={(id) =>
                                            setDraft((old) => {
                                                const next = structuredClone(old);
                                                if (next.style.background.imageId === id)
                                                    next.style.background = { ...next.style.background, imageId: null, type: 'color' };
                                                next.members.backgroundIds = next.members.backgroundIds.filter((x) => x !== id);
                                                return next;
                                            })
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground">{tr('levels.theImageLibraryIsSharedWith')}</p>
                                    <RangeField
                                        label={tr('levels.blurImage')}
                                        min={0}
                                        max={20}
                                        value={style.background.blur}
                                        onChange={(blur) => patchStyle((s) => void (s.background.blur = blur))}
                                    />
                                </>
                            )}
                            <RangeField
                                label={tr('levels.backgroundDarkeningHelpsTextStayReadable')}
                                unit="%"
                                min={0}
                                max={90}
                                value={Math.round(style.background.overlayOpacity * 100)}
                                onChange={(v) => patchStyle((s) => void (s.background.overlayOpacity = v / 100))}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.colorsText')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={tr('levels.accentColor')} hint={tr('levels.xpBarLevelNumberAvatarRing')}>
                                    <ColorField value={style.accentColor} onChange={(c) => patchStyle((s) => void (s.accentColor = c))} />
                                </Field>
                                <Field label={tr('common.textColor')}>
                                    <ColorField value={style.textColor} onChange={(c) => patchStyle((s) => void (s.textColor = c))} />
                                </Field>
                                <Field label={tr('levels.secondaryTextColor')} hint={tr('levels.rankLevelLabelsUsernameXpNumbers')}>
                                    <ColorField value={style.subTextColor} onChange={(c) => patchStyle((s) => void (s.subTextColor = c))} />
                                </Field>
                                <Field label={tr('levels.xpBarTrackColor')}>
                                    <ColorField value={style.trackColor} onChange={(c) => patchStyle((s) => void (s.trackColor = c))} />
                                </Field>
                                <Field label={tr('common.font')}>
                                    <NativeSelect
                                        className="w-full"
                                        value={style.font}
                                        onChange={(e) => patchStyle((s) => void (s.font = e.target.value as RankCardStyle['font']))}
                                    >
                                        {meta.fonts.map((font) => (
                                            <option key={font.id} value={font.id}>
                                                {font.label}
                                            </option>
                                        ))}
                                    </NativeSelect>
                                </Field>
                                <Field label={tr('levels.avatarShape')}>
                                    <Segmented
                                        value={style.avatarShape}
                                        options={SHAPE_LABELS()}
                                        onChange={(shape) => patchStyle((s) => void (s.avatarShape = shape))}
                                    />
                                </Field>
                            </div>
                            <RangeField
                                label={tr('levels.infoPanelOpacity')}
                                unit="%"
                                min={0}
                                max={90}
                                value={Math.round(style.panelOpacity * 100)}
                                onChange={(v) => patchStyle((s) => void (s.panelOpacity = v / 100))}
                            />
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.infoShownOnTheRankCard')}</CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-2 sm:grid-cols-2">
                            {(Object.keys(SHOW_LABELS()) as (keyof RankCardStyle['show'])[]).map((key) => (
                                <SwitchRow
                                    key={key}
                                    label={SHOW_LABELS()[key]}
                                    checked={style.show[key]}
                                    onChange={(on) => patchStyle((s) => void (s.show[key] = on))}
                                />
                            ))}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>{tr('levels.whatMembersCanCustomize')}</CardTitle>
                            <CardDescription>{tr('levels.membersCustomizeTheirOwnCardFrom')}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <SwitchRow
                                label={tr('levels.letMembersCustomizeTheirCard')}
                                checked={draft.members.enabled}
                                onChange={(enabled) => patchMembers({ enabled })}
                            />
                            <fieldset disabled={!draft.members.enabled} className="space-y-3 disabled:opacity-50">
                                <div className="grid gap-2 sm:grid-cols-3">
                                    <SwitchRow
                                        label={tr('levels.chooseCardLayout')}
                                        checked={draft.members.layout}
                                        onChange={(layout) => patchMembers({ layout })}
                                    />
                                    <SwitchRow
                                        label={tr('levels.changeColorsBackgroundColor')}
                                        checked={draft.members.colors}
                                        onChange={(colors) => patchMembers({ colors })}
                                    />
                                    <SwitchRow
                                        label={tr('levels.chooseBackgroundImage')}
                                        checked={draft.members.backgrounds}
                                        onChange={(backgrounds) => patchMembers({ backgrounds })}
                                    />
                                </div>
                                {draft.members.backgrounds && (
                                    <div className="space-y-2">
                                        <p className="text-sm">
                                            {tr('levels.imagesMembersCanPick')}
                                            {draft.members.backgroundIds.length}/{meta.limits.maxMemberBackgrounds}
                                            {tr('levels.clickToSelectRemove')}
                                        </p>
                                        {assets.length ? (
                                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                                {assets.map((asset) => {
                                                    const on = draft.members.backgroundIds.includes(asset.id);
                                                    return (
                                                        <button
                                                            key={asset.id}
                                                            type="button"
                                                            title={asset.name}
                                                            onClick={() => toggleMemberBackground(asset.id)}
                                                            className={cn(
                                                                'relative overflow-hidden rounded-md border text-left',
                                                                on ? 'border-primary ring-2 ring-primary/40' : 'opacity-60 hover:opacity-100',
                                                            )}
                                                        >
                                                            <img
                                                                src={assetImageUrl(guildId, asset.id)}
                                                                alt=""
                                                                loading="lazy"
                                                                className="aspect-video w-full object-cover"
                                                            />
                                                            <span className="block truncate px-1.5 py-1 text-[11px]">{asset.name}</span>
                                                            {on && (
                                                                <Check className="absolute top-1 right-1 size-4 rounded-full bg-primary p-0.5 text-primary-foreground" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">{tr('levels.noImagesInTheLibraryYet')}</p>
                                        )}
                                    </div>
                                )}
                            </fieldset>
                        </CardContent>
                    </Card>
                </fieldset>

                <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
                    <RankPreview
                        queryKey={rankCardKey(guildId)}
                        input={draft}
                        fetcher={(theme, signal) => rankCardApi.preview(guildId, { kind, theme }, signal)}
                        kind={kind}
                        kinds={['rank', 'leaderboard', 'levelup']}
                        onKind={setKind}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">{tr('levels.thePreviewUsesTheAvatarAnd')}</p>
                </div>
            </div>
            <SaveBar dirty={dirty} saving={save.isPending} saveLabel={tr('levels.saveTheme')} onSave={() => save.mutate()} onReset={() => setDraft(saved)}>
                <Button
                    variant="outline"
                    disabled={save.isPending}
                    onClick={async () => {
                        if (!(await confirm({ title: tr('levels.resetToTheDefaultTheme'), description: tr('levels.valuesEditedOnThisPageAre') }))) return;
                        setDraft(meta.defaultTheme);
                    }}
                >
                    <RotateCcw /> {tr('levels.defaults')}
                </Button>
            </SaveBar>
        </div>
    );
}
