import type { WelcomeCard } from '@notstack/shared';

// ฟิลด์ที่ต้องกดบันทึก (enabled แยกไปบันทึกทันทีจากสวิตช์)
export const DRAFT_FIELDS = ['name', 'channelId', 'content', 'design', 'backgroundId'] as const;

export type CardDraft = Pick<WelcomeCard, (typeof DRAFT_FIELDS)[number] | 'enabled' | 'id'>;

export type Section = 'general' | 'background' | 'avatar' | 'texts';

export const pickDraft = (card: CardDraft) => Object.fromEntries(DRAFT_FIELDS.map((key) => [key, card[key]])) as Pick<WelcomeCard, (typeof DRAFT_FIELDS)[number]>;

export const isDirty = (draft: CardDraft | null, saved: CardDraft | null) =>
    Boolean(draft && saved) && JSON.stringify(pickDraft(draft!)) !== JSON.stringify(pickDraft(saved!));

export const SIZE_PRESETS = [
    { w: 1024, h: 450, label: '1024 × 450 — แนะนำ' },
    { w: 1200, h: 500, label: '1200 × 500 — แบนเนอร์กว้าง' },
    { w: 1000, h: 350, label: '1000 × 350 — แบนเนอร์เตี้ย' },
    { w: 800, h: 800, label: '800 × 800 — จัตุรัส' },
];

export const FIT_LABELS = { cover: 'เต็มกรอบ (ครอป)', contain: 'เห็นทั้งรูป', stretch: 'ยืดให้เต็ม' } as const;
export const SHAPE_LABELS = { circle: 'วงกลม', rounded: 'มุมโค้ง', square: 'สี่เหลี่ยม' } as const;
export const ALIGN_LABELS = { left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา' } as const;

export const layerTitle = (text: string) => text.replace(/\s+/g, ' ').trim() || '(ข้อความว่าง)';
