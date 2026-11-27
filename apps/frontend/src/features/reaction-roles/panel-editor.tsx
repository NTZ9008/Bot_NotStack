import { useEffect, useState } from 'react';
import { SaveBar } from '@/components/page-controls';
import { Spinner } from '@/components/ui/spinner';
import {
    HEX_COLOR_RE,
    REACTION_ROLE_BUTTON_STYLES,
    REACTION_ROLE_DEFAULT_COLOR,
    REACTION_ROLE_LIMITS,
    REACTION_ROLE_MODES,
    reactionRolePanelInputSchema,
    type CreateReactionRolePanelInput,
    type GuildChannel,
    type GuildRole,
    type ReactionRoleButtonStyle,
    type ReactionRoleMode,
    type ReactionRolePanelDto,
} from '@notstack/shared';
import { ChannelSelect, channelLabel } from '@/components/channel-select';
import { ColorField } from '@/components/color-field';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, Plus, Send, Sparkles, Trash2 } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { renderDiscordMarkdown } from '@/lib/discord-markdown';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export interface DraftItem {
    key: string;
    roleId: string;
    label: string;
    emoji: string;
    buttonStyle: ReactionRoleButtonStyle;
}

export interface PanelDraft {
    title: string;
    description: string;
    channelId: string;
    embedColor: string;
    mode: ReactionRoleMode;
    allowMultiple: boolean;
    items: DraftItem[];
}

const CUSTOM_EMOJI_ID_RE = /^<(a?):[a-zA-Z0-9_]{1,32}:(\d{5,25})>$/;

function renderEmojiPreview(emoji: string) {
    const trimmed = emoji.trim();
    if (!trimmed) return null;
    const match = CUSTOM_EMOJI_ID_RE.exec(trimmed);
    if (match) {
        const animated = match[1] === 'a';
        const id = match[2]!;
        return <img src={`https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'webp'}?size=32`} alt="" className="size-4 shrink-0 object-contain" />;
    }
    return <span className="shrink-0">{trimmed}</span>;
}

const DISCORD_BUTTON_CLASSES: Record<ReactionRoleButtonStyle, string> = {
    PRIMARY: 'bg-[#5865F2] hover:bg-[#4752C4] text-white',
    SECONDARY: 'bg-[#4E5058] hover:bg-[#6D6F78] text-white',
    SUCCESS: 'bg-[#248046] hover:bg-[#1A6334] text-white',
    DANGER: 'bg-[#DA373C] hover:bg-[#A12828] text-white',
};

function makeDraftFromPanel(panel: ReactionRolePanelDto | null, channels: GuildChannel[]): PanelDraft {
    if (panel) {
        return {
            title: panel.title,
            description: panel.description,
            channelId: panel.channelId,
            embedColor: panel.embedColor,
            mode: panel.mode,
            allowMultiple: panel.allowMultiple,
            items: panel.items.map((item) => ({
                key: `item-${item.id}`,
                roleId: item.roleId,
                label: item.label,
                emoji: item.emoji ?? '',
                buttonStyle: item.buttonStyle,
            })),
        };
    }

    return {
        title: '',
        description: '',
        channelId: channels.find((ch) => ch.sendable)?.id ?? '',
        embedColor: REACTION_ROLE_DEFAULT_COLOR,
        mode: 'BUTTON',
        allowMultiple: true,
        items: [],
    };
}

export interface PanelEditorProps {
    panel: ReactionRolePanelDto | null;
    channels: GuildChannel[];
    roles: GuildRole[];
    saving: boolean;
    publishing: boolean;
    deleting: boolean;
    onSave: (payload: CreateReactionRolePanelInput) => Promise<void>;
    onPublish: (payload: CreateReactionRolePanelInput, isDirty: boolean) => Promise<void>;
    onDelete?: () => Promise<void>;
}

export function PanelEditor({ panel, channels, roles, saving, publishing, deleting, onSave, onPublish, onDelete }: PanelEditorProps) {
    const t = useT();
    const sendableChannels = channels.filter((ch) => ch.sendable);
    const busy = saving || publishing || deleting;

    const [draft, setDraft] = useState<PanelDraft>(() => makeDraftFromPanel(panel, channels));
    const [isDirty, setIsDirty] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        setDraft(makeDraftFromPanel(panel, channels));
        setIsDirty(false);
        setFormError(null);
    }, [panel, channels]);

    const patchDraft = (patch: Partial<PanelDraft>) => {
        setDraft((prev) => ({ ...prev, ...patch }));
        setIsDirty(true);
        setFormError(null);
    };

    const addRoleItem = () => {
        if (draft.items.length >= REACTION_ROLE_LIMITS.maxItemsPerPanel) return;
        const usedIds = new Set(draft.items.map((item) => item.roleId));
        const nextRole = roles.find((r) => !usedIds.has(r.id));
        const newItem: DraftItem = {
            key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            roleId: nextRole?.id ?? '',
            label: nextRole ? nextRole.name.slice(0, REACTION_ROLE_LIMITS.maxLabelLength) : '',
            emoji: '',
            buttonStyle: 'PRIMARY',
        };
        patchDraft({ items: [...draft.items, newItem] });
    };

    const updateRoleItem = (key: string, patch: Partial<DraftItem>) => {
        patchDraft({
            items: draft.items.map((item) => {
                if (item.key !== key) return item;
                const next = { ...item, ...patch };
                if (patch.roleId && !item.label.trim()) {
                    const role = roles.find((r) => r.id === patch.roleId);
                    if (role) next.label = role.name.slice(0, REACTION_ROLE_LIMITS.maxLabelLength);
                }
                return next;
            }),
        });
    };

    const moveRoleItem = (index: number, direction: -1 | 1) => {
        const targetIndex = index + direction;
        if (targetIndex < 0 || targetIndex >= draft.items.length) return;
        const copy = [...draft.items];
        const [moved] = copy.splice(index, 1);
        copy.splice(targetIndex, 0, moved!);
        patchDraft({ items: copy });
    };

    const removeRoleItem = (key: string) => {
        patchDraft({ items: draft.items.filter((item) => item.key !== key) });
    };

    const validateDraft = (): CreateReactionRolePanelInput | null => {
        const parsed = reactionRolePanelInputSchema.safeParse({
            title: draft.title,
            description: draft.description,
            channelId: draft.channelId,
            embedColor: draft.embedColor,
            mode: draft.mode,
            allowMultiple: draft.allowMultiple,
            items: draft.items.map((item, idx) => ({
                roleId: item.roleId,
                label: item.label,
                emoji: item.emoji || null,
                buttonStyle: item.buttonStyle,
                sortOrder: idx,
            })),
        });

        if (!parsed.success) {
            setFormError(parsed.error.issues[0]?.message ?? t('reactionRoles.invalidInput'));
            return null;
        }
        setFormError(null);
        return parsed.data;
    };

    const handleSave = async () => {
        const payload = validateDraft();
        if (!payload) return;
        await onSave(payload);
        setIsDirty(false);
    };

    const handlePublish = async () => {
        const payload = validateDraft();
        if (!payload) return;
        if ((payload.items?.length ?? 0) === 0) {
            setFormError(t('reactionRoles.needAtLeastOneItemBeforePublish'));
            return;
        }
        await onPublish(payload, !panel || isDirty);
        setIsDirty(false);
    };

    const previewColor = HEX_COLOR_RE.test(draft.embedColor) ? draft.embedColor : REACTION_ROLE_DEFAULT_COLOR;
    const roleMap = new Map(roles.map((r) => [r.id, r.name]));
    const buttonRows: DraftItem[][] = [];
    for (let i = 0; i < draft.items.length; i += 5) {
        buttonRows.push(draft.items.slice(i, i + 5));
    }

    const buttonStyleLabel = (style: ReactionRoleButtonStyle) => {
        switch (style) {
            case 'PRIMARY':
                return t('reactionRoles.stylePrimary');
            case 'SECONDARY':
                return t('reactionRoles.styleSecondary');
            case 'SUCCESS':
                return t('reactionRoles.styleSuccess');
            case 'DANGER':
                return t('reactionRoles.styleDanger');
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">{panel ? t('reactionRoles.editPanel') : t('reactionRoles.newPanel')}</CardTitle>
                                    <CardDescription className="text-xs">
                                        {panel?.messageId
                                            ? t('reactionRoles.publishedInChannel', {
                                                  0: channelLabel(channels, panel.channelId) ?? panel.channelId,
                                              })
                                            : t('reactionRoles.notPublishedYet')}
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    {panel?.messageId ? (
                                        <Badge className="gap-1 border border-success/30 bg-success/12 text-success">
                                            <CheckCircle2 className="size-3" />
                                            {t('reactionRoles.statusSynced')}
                                        </Badge>
                                    ) : (
                                        <Badge variant="secondary" className="text-muted-foreground">
                                            {t('reactionRoles.statusDraft')}
                                        </Badge>
                                    )}
                                    {isDirty && (
                                        <Badge variant="outline" className="border-warning/40 text-warning">
                                            {t('reactionRoles.unsavedChanges')}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('reactionRoles.panelTitle')} htmlFor="rr-title">
                                    <Input
                                        id="rr-title"
                                        value={draft.title}
                                        maxLength={REACTION_ROLE_LIMITS.maxTitleLength}
                                        placeholder={t('reactionRoles.panelTitlePlaceholder')}
                                        onChange={(e) => patchDraft({ title: e.target.value })}
                                        disabled={busy}
                                    />
                                </Field>

                                <Field label={t('reactionRoles.targetChannel')} htmlFor="rr-channel">
                                    <ChannelSelect
                                        id="rr-channel"
                                        channels={sendableChannels}
                                        value={draft.channelId}
                                        onChange={(channelId) => patchDraft({ channelId })}
                                        disabled={busy}
                                    />
                                </Field>
                            </div>

                            <Field label={t('reactionRoles.panelDescription')} htmlFor="rr-description" hint={t('reactionRoles.supportsMarkdown')}>
                                <Textarea
                                    id="rr-description"
                                    rows={3}
                                    maxLength={REACTION_ROLE_LIMITS.maxDescriptionLength}
                                    placeholder={t('reactionRoles.panelDescriptionPlaceholder')}
                                    value={draft.description}
                                    onChange={(e) => patchDraft({ description: e.target.value })}
                                    disabled={busy}
                                />
                            </Field>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label={t('reactionRoles.interactionMode')}>
                                    <Select value={draft.mode} onValueChange={(value) => patchDraft({ mode: value as ReactionRoleMode })} disabled={busy}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {REACTION_ROLE_MODES.map((m) => (
                                                <SelectItem key={m} value={m}>
                                                    {m === 'BUTTON' ? t('reactionRoles.modeButton') : t('reactionRoles.modeSelect')}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </Field>

                                <Field label={t('reactionRoles.embedColor')} htmlFor="rr-embed-color">
                                    <ColorField id="rr-embed-color" value={previewColor} onChange={(embedColor) => patchDraft({ embedColor })} />
                                </Field>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3.5 py-2.5">
                                <div className="pr-2">
                                    <div className="text-xs font-medium text-foreground">{t('reactionRoles.allowMultiple')}</div>
                                    <div className="text-[11px] text-muted-foreground">{t('reactionRoles.allowMultipleHint')}</div>
                                </div>
                                <Switch
                                    aria-label={t('reactionRoles.allowMultiple')}
                                    checked={draft.allowMultiple}
                                    onCheckedChange={(allowMultiple) => patchDraft({ allowMultiple })}
                                    disabled={busy}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base">
                                        {t('reactionRoles.roleItemsTitle', {
                                            0: draft.items.length,
                                            1: REACTION_ROLE_LIMITS.maxItemsPerPanel,
                                        })}
                                    </CardTitle>
                                    <CardDescription className="text-xs">{t('reactionRoles.roleItemsDesc')}</CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={addRoleItem}
                                    disabled={busy || draft.items.length >= REACTION_ROLE_LIMITS.maxItemsPerPanel}
                                    className="gap-1.5"
                                >
                                    <Plus className="size-3.5" />
                                    {t('reactionRoles.addRoleItem')}
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="space-y-3">
                            {draft.items.length === 0 ? (
                                <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                                    {t('reactionRoles.noItemsYet')}
                                </div>
                            ) : (
                                draft.items.map((item, idx) => {
                                    const roleMissing = Boolean(item.roleId && !roles.some((r) => r.id === item.roleId));
                                    return (
                                        <div key={item.key} className="space-y-3 rounded-lg border border-border/80 bg-muted/20 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-xs font-semibold text-muted-foreground">
                                                    #{idx + 1}
                                                    {item.roleId && roleMap.get(item.roleId) ? ` · @${roleMap.get(item.roleId)}` : ''}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        disabled={busy || idx === 0}
                                                        onClick={() => moveRoleItem(idx, -1)}
                                                        aria-label={t('reactionRoles.moveUp')}
                                                        className="size-7"
                                                    >
                                                        <ArrowUp className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        disabled={busy || idx === draft.items.length - 1}
                                                        onClick={() => moveRoleItem(idx, 1)}
                                                        aria-label={t('reactionRoles.moveDown')}
                                                        className="size-7"
                                                    >
                                                        <ArrowDown className="size-3.5" />
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        disabled={busy}
                                                        onClick={() => removeRoleItem(item.key)}
                                                        aria-label={t('common.delete')}
                                                        className="size-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                    >
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                </div>
                                            </div>

                                            <div className="grid gap-3 sm:grid-cols-2">
                                                <Field label={t('reactionRoles.itemRole')}>
                                                    <Select
                                                        value={item.roleId}
                                                        onValueChange={(roleId) => updateRoleItem(item.key, { roleId })}
                                                        disabled={busy}
                                                    >
                                                        <SelectTrigger className="w-full">
                                                            <SelectValue placeholder={t('reactionRoles.selectRolePlaceholder')} />
                                                        </SelectTrigger>
                                                        <SelectContent className="max-h-72">
                                                            {roles.map((role) => (
                                                                <SelectItem key={role.id} value={role.id}>
                                                                    @{role.name}
                                                                </SelectItem>
                                                            ))}
                                                            {roleMissing && (
                                                                <SelectItem value={item.roleId}>{t('common.notFoundInDiscord', { 0: item.roleId })}</SelectItem>
                                                            )}
                                                        </SelectContent>
                                                    </Select>
                                                </Field>

                                                <Field label={t('reactionRoles.itemLabel')}>
                                                    <Input
                                                        value={item.label}
                                                        maxLength={REACTION_ROLE_LIMITS.maxLabelLength}
                                                        placeholder={t('reactionRoles.itemLabelPlaceholder')}
                                                        onChange={(e) => updateRoleItem(item.key, { label: e.target.value })}
                                                        disabled={busy}
                                                    />
                                                </Field>
                                            </div>

                                            <div className={cn('grid gap-3', draft.mode === 'BUTTON' ? 'sm:grid-cols-2' : 'grid-cols-1')}>
                                                <Field label={t('reactionRoles.itemEmoji')}>
                                                    <Input
                                                        value={item.emoji}
                                                        maxLength={REACTION_ROLE_LIMITS.maxEmojiLength}
                                                        placeholder={t('reactionRoles.itemEmojiPlaceholder')}
                                                        onChange={(e) => updateRoleItem(item.key, { emoji: e.target.value })}
                                                        disabled={busy}
                                                    />
                                                </Field>

                                                {draft.mode === 'BUTTON' && (
                                                    <Field label={t('reactionRoles.itemStyle')}>
                                                        <Select
                                                            value={item.buttonStyle}
                                                            onValueChange={(value) =>
                                                                updateRoleItem(item.key, { buttonStyle: value as ReactionRoleButtonStyle })
                                                            }
                                                            disabled={busy}
                                                        >
                                                            <SelectTrigger className="w-full">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {REACTION_ROLE_BUTTON_STYLES.map((style) => (
                                                                    <SelectItem key={style} value={style}>
                                                                        {buttonStyleLabel(style)}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </Field>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {formError && <p className="text-xs font-medium text-destructive">{formError}</p>}
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-2.5 xl:sticky xl:top-20 xl:self-start">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">{t('reactionRoles.previewTitle')}</p>
                        <Badge variant="outline" className="gap-1 text-[10px]">
                            <Sparkles className="size-3 text-violet-500" />
                            {draft.mode === 'BUTTON' ? t('reactionRoles.modeButtonShort') : t('reactionRoles.modeSelectShort')}
                        </Badge>
                    </div>

                    <DiscordMessage>
                        <div className="dark max-w-lg rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderLeftColor: previewColor }}>
                            <p className="mb-1 font-semibold text-white">{draft.title.trim() || t('reactionRoles.previewPlaceholderTitle')}</p>
                            {draft.description.trim() ? (
                                <div className="discord-md text-sm" dangerouslySetInnerHTML={{ __html: renderDiscordMarkdown(draft.description) }} />
                            ) : (
                                <p className="text-sm text-[#949ba4] italic">{t('reactionRoles.previewPlaceholderDesc')}</p>
                            )}
                            <p className="mt-2.5 text-[11px] text-[#949ba4]">
                                {draft.allowMultiple ? t('reactionRoles.footerMulti') : t('reactionRoles.footerSingle')}
                            </p>
                        </div>

                        {draft.items.length > 0 && (
                            <div className="mt-2 max-w-lg space-y-1.5">
                                {draft.mode === 'BUTTON' ? (
                                    buttonRows.map((row, rowIdx) => (
                                        <div key={rowIdx} className="flex flex-wrap gap-1.5">
                                            {row.map((item) => (
                                                <span
                                                    key={item.key}
                                                    className={cn(
                                                        'inline-flex items-center gap-1.5 rounded-[3px] px-3.5 py-1.5 text-sm font-medium transition-colors',
                                                        DISCORD_BUTTON_CLASSES[item.buttonStyle],
                                                    )}
                                                >
                                                    {item.emoji && renderEmojiPreview(item.emoji)}
                                                    <span>{item.label.trim() || t('reactionRoles.previewUntitledItem')}</span>
                                                </span>
                                            ))}
                                        </div>
                                    ))
                                ) : (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between rounded border border-[#1e1f22] bg-[#1e1f22] px-3 py-2 text-sm text-[#949ba4]">
                                            <span>
                                                {draft.allowMultiple ? t('reactionRoles.selectPlaceholderMulti') : t('reactionRoles.selectPlaceholderSingle')}
                                            </span>
                                            <ChevronDown className="size-4" />
                                        </div>
                                        <div className="divide-y divide-[#3f4147]/50 rounded border border-[#1e1f22] bg-[#2b2d31]">
                                            {draft.items.map((item) => (
                                                <div key={item.key} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-[#dbdee1]">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        {item.emoji && renderEmojiPreview(item.emoji)}
                                                        <span className="truncate font-medium">
                                                            {item.label.trim() || t('reactionRoles.previewUntitledItem')}
                                                        </span>
                                                    </div>
                                                    {item.roleId && roleMap.get(item.roleId) && (
                                                        <span className="shrink-0 text-[11px] text-[#949ba4]">@{roleMap.get(item.roleId)}</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </DiscordMessage>
                </div>
            </div>
            <SaveBar
                dirty={isDirty || !panel}
                saving={saving}
                onSave={() => void handleSave()}
                onReset={
                    panel
                        ? () => {
                              setDraft(makeDraftFromPanel(panel, channels));
                              setIsDirty(false);
                          }
                        : undefined
                }
            >
                {panel && onDelete && (
                    <Button type="button" variant="destructive" disabled={busy} onClick={() => void onDelete()}>
                        {deleting ? <Spinner /> : <Trash2 />}
                        {t('reactionRoles.deletePanel')}
                    </Button>
                )}
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void handlePublish()}>
                    {publishing ? <Spinner /> : <Send />}
                    {panel?.messageId ? t('reactionRoles.syncToDiscord') : t('reactionRoles.publishToDiscord')}
                </Button>
            </SaveBar>
        </div>
    );
}
