import type { GuildChannel, GuildRole, WelcomeVars } from '@notstack/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { welcomeApi, type PreviewInput } from '@/api/welcome';
import { DiscordMessage } from '@/components/discord-message';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { errorMessage } from '@/lib/api';
import { escapeHtml, renderDiscordMarkdown } from '@/lib/discord-markdown';
import { cn } from '@/lib/utils';
import type { PatchDraft } from './editor-form';
import { layerTitle, type CardDraft } from './types';
import { useGuildId } from '@/hooks/use-guild';

const PREVIEW_DELAY = 250;
const MENTION_TOKEN = 'WCMENTIONTOKEN';
const FALLBACK_VARS: WelcomeVars = { user: 'สมาชิกใหม่', username: 'new_member', id: '0', server: 'NotStack', memberCount: '0' };

export type Handle = 'avatar' | number;

// ข้อความที่ส่งคู่กับรูป — แทนค่าตัวแปรฝั่งหน้าเว็บเลย (ไม่ต้องรอ server) แล้วแสดงแบบ Markdown ของ Discord
function renderMessage(content: string, vars: WelcomeVars, roles: GuildRole[], channels: GuildChannel[]): string {
    const filled = content.replace(/\{(\w+)\}/g, (match, key: string) => {
        if (key === 'mention') return MENTION_TOKEN;
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key as keyof WelcomeVars] : match;
    });
    // แท็กยศ / ห้อง / คน ที่พิมพ์ไว้เอง (<@&id> <#id> <@id>) — แสดงเป็นชื่อแบบใน Discord
    const mention = (text: string) => `<span class="dc-mention">${escapeHtml(text)}</span>`;
    return renderDiscordMarkdown(filled)
        .split(MENTION_TOKEN)
        .join(mention(`@${vars.user}`))
        .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id: string) => mention(`@${roles.find((r) => r.id === id)?.name ?? 'ยศ'}`))
        .replace(/&lt;#(\d+)&gt;/g, (_, id: string) => mention(`#${channels.find((ch) => ch.id === id)?.name ?? 'ห้อง'}`))
        .replace(/&lt;@!?(\d+)&gt;/g, () => mention('@ผู้ใช้'));
}

/**
 * ตัวอย่างใน Discord — รูปวาดที่ server ด้วยโค้ดเดียวกับตอนส่งจริง
 * ลากรูปโปรไฟล์ / จุดตัวเลขบนรูปเพื่อย้ายตำแหน่ง (ภาพจริงวาดใหม่ตามหลังเล็กน้อย) — คลิกเฉยๆ = เปิดการตั้งค่าขององค์ประกอบนั้น
 */
export function WelcomePreview({
    draft,
    patch,
    sampleUserId,
    bot,
    roles,
    channels,
    onVars,
    onFocusElement,
}: {
    draft: CardDraft;
    patch: PatchDraft;
    sampleUserId: string | null;
    bot: { name: string; avatar: string } | null;
    roles: GuildRole[];
    channels: GuildChannel[];
    onVars: (vars: WelcomeVars) => void;
    onFocusElement: (handle: Handle) => void;
}) {
    const guildId = useGuildId();
    const { design } = draft;
    const payload = useDebouncedValue<PreviewInput>({ design, backgroundId: draft.backgroundId, userId: sampleUserId }, PREVIEW_DELAY);
    const preview = useQuery({
        queryKey: ['guild', guildId, 'welcome', 'preview', payload],
        queryFn: ({ signal }) => welcomeApi.preview(guildId, payload, signal),
        placeholderData: keepPreviousData,
        staleTime: Infinity,
        retry: false,
    });
    const vars = preview.data?.vars ?? FALLBACK_VARS;
    useEffect(() => {
        if (preview.data?.vars) onVars(preview.data.vars);
    }, [preview.data?.vars, onVars]);

    const stage = useRef<HTMLDivElement>(null);
    const [stageWidth, setStageWidth] = useState(0);
    const [guides, setGuides] = useState({ v: false, h: false });
    useEffect(() => {
        if (!stage.current) return;
        const observer = new ResizeObserver(([entry]) => setStageWidth(entry?.contentRect.width ?? 0));
        observer.observe(stage.current);
        return () => observer.disconnect();
    }, []);
    const scale = stageWidth / design.width || 0;

    const startDrag = (e: React.PointerEvent<HTMLDivElement>, handle: Handle) => {
        if (e.button !== 0 || !scale) return;
        e.preventDefault();
        const el = e.currentTarget;
        const target = handle === 'avatar' ? design.avatar : design.texts[handle];
        if (!target) return;
        const start = { px: e.clientX, py: e.clientY, x: target.x, y: target.y };
        const snap = 8 / scale; // ดูดเข้ากึ่งกลางเมื่อลากมาใกล้ (8 พิกเซลบนจอ)
        let moved = false;
        el.setPointerCapture(e.pointerId);

        const onMove = (ev: PointerEvent) => {
            if (!moved && Math.hypot(ev.clientX - start.px, ev.clientY - start.py) < 3) return;
            moved = true;
            let x = Math.round(Math.min(design.width, Math.max(0, start.x + (ev.clientX - start.px) / scale)));
            let y = Math.round(Math.min(design.height, Math.max(0, start.y + (ev.clientY - start.py) / scale)));
            const snapX = Math.abs(x - design.width / 2) < snap;
            const snapY = Math.abs(y - design.height / 2) < snap;
            if (snapX) x = Math.round(design.width / 2);
            if (snapY) y = Math.round(design.height / 2);
            setGuides({ v: snapX, h: snapY });
            patch((d) => {
                const item = handle === 'avatar' ? d.design.avatar : d.design.texts[handle];
                if (!item) return;
                item.x = x;
                item.y = y;
            });
        };
        const onUp = () => {
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
            setGuides({ v: false, h: false });
            if (!moved) onFocusElement(handle);
        };
        el.addEventListener('pointermove', onMove);
        el.addEventListener('pointerup', onUp);
        el.addEventListener('pointercancel', onUp);
    };

    const avatarBox = (design.avatar.size + design.avatar.borderWidth * 2) * scale;

    return (
        <DiscordMessage bot={bot}>
            {draft.content.trim() && <div className="discord-md" dangerouslySetInnerHTML={{ __html: renderMessage(draft.content, vars, roles, channels) }} />}
            <div
                ref={stage}
                className="relative mt-1 w-full max-w-xl touch-none overflow-hidden rounded-lg bg-black/30 select-none"
                style={{ aspectRatio: `${design.width} / ${design.height}` }}
            >
                {preview.data && <img src={preview.data.image} alt="ตัวอย่างการ์ดต้อนรับ" className="absolute inset-0 size-full" draggable={false} />}

                {guides.v && <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-pink-400" />}
                {guides.h && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-pink-400" />}

                {scale > 0 && (
                    <>
                        {design.avatar.visible && (
                            <div
                                role="button"
                                title="ลากเพื่อย้ายรูปโปรไฟล์"
                                className={cn(
                                    'absolute cursor-move border-2 border-dashed border-white/0 transition-colors hover:border-white/70',
                                    design.avatar.shape === 'circle' ? 'rounded-full' : 'rounded-md',
                                )}
                                style={{ width: avatarBox, height: avatarBox, left: design.avatar.x * scale - avatarBox / 2, top: design.avatar.y * scale - avatarBox / 2 }}
                                onPointerDown={(e) => startDrag(e, 'avatar')}
                            />
                        )}
                        {design.texts.map((layer, i) => (
                            <div
                                key={i}
                                role="button"
                                title={layerTitle(layer.text)}
                                className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border border-white bg-primary text-[10px] font-bold text-white shadow"
                                style={{ left: layer.x * scale, top: layer.y * scale }}
                                onPointerDown={(e) => startDrag(e, i)}
                            >
                                {i + 1}
                            </div>
                        ))}
                    </>
                )}

                {(!preview.data || preview.error) && (
                    <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[#b5bac1]">
                        {preview.error ? `สร้างรูปตัวอย่างไม่สำเร็จ: ${errorMessage(preview.error)}` : 'กำลังสร้างรูปตัวอย่าง...'}
                    </div>
                )}
                {preview.isFetching && preview.data && <Loader2 className="absolute top-2 right-2 size-4 animate-spin text-white/80" />}
            </div>
        </DiscordMessage>
    );
}
