import { tr, byLang } from '../../lib/i18n';
import type { WelcomeCard } from '@notstack/shared';

// ฟิลด์ที่ต้องกดบันทึก (enabled แยกไปบันทึกทันทีจากสวิตช์)
export const DRAFT_FIELDS = ['name', 'channelId', 'content', 'design', 'backgroundId'] as const;

export type CardDraft = Pick<WelcomeCard, (typeof DRAFT_FIELDS)[number] | 'enabled' | 'id' | 'event'>;

export type Section = 'general' | 'background' | 'avatar' | 'texts';

export const pickDraft = (card: CardDraft) =>
    Object.fromEntries(DRAFT_FIELDS.map((key) => [key, card[key]])) as Pick<WelcomeCard, (typeof DRAFT_FIELDS)[number]>;

export const isDirty = (draft: CardDraft | null, saved: CardDraft | null) =>
    Boolean(draft && saved) && JSON.stringify(pickDraft(draft!)) !== JSON.stringify(pickDraft(saved!));

export const SIZE_PRESETS = byLang(() => [
    { w: 1024, h: 450, label: tr('welcome.n1024450Recommended') },
    { w: 1200, h: 500, label: tr('welcome.n1200500WideBanner') },
    { w: 1000, h: 350, label: tr('welcome.n1000350ShortBanner') },
    { w: 800, h: 800, label: tr('welcome.n800800Square') },
]);

export const FIT_LABELS = byLang(() => ({ cover: tr('welcome.fillCrop'), contain: tr('welcome.fitWholeImage'), stretch: tr('welcome.stretch') }) as const);
export const SHAPE_LABELS = byLang(() => ({ circle: tr('welcome.circle'), rounded: tr('welcome.rounded'), square: tr('welcome.square') }) as const);
export const ALIGN_LABELS = byLang(() => ({ left: tr('welcome.left'), center: tr('welcome.center'), right: tr('welcome.right') }) as const);

export const layerTitle = (text: string) => text.replace(/\s+/g, ' ').trim() || tr('welcome.emptyText');
