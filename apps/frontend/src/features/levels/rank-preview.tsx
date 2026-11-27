import { useObjectUrl } from '@/hooks/use-object-url';
import { Spinner } from '@/components/ui/spinner';
import type { RankPreviewKind } from '@notstack/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { DiscordMessage } from '@/components/discord-message';
import { Segmented } from '@/features/welcome/form-controls';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { errorMessage, type ImagePreview } from '@/lib/api';
import { byLang, tr } from '../../lib/i18n';

export const PREVIEW_KIND_LABELS = byLang((): Record<RankPreviewKind, string> => ({
    rank: '/rank',
    leaderboard: '/leaderboard',
    levelup: tr('levels.levelUp'),
}));

/**
 * ตัวอย่างการ์ดในกรอบข้อความแบบ Discord — รูปวาดที่ server ด้วยโค้ดเดียวกับตอนส่งจริง
 * รอให้หยุดแก้ 250ms ก่อนขอรูปใหม่ (ระหว่างนั้นยังแสดงรูปเดิม)
 */
export function RankPreview<T>({
    queryKey,
    input,
    fetcher,
    kind,
    kinds,
    onKind,
    children,
}: {
    queryKey: readonly unknown[];
    input: T;
    fetcher: (input: T, signal: AbortSignal) => Promise<ImagePreview>;
    kind: RankPreviewKind;
    kinds: RankPreviewKind[];
    onKind: (kind: RankPreviewKind) => void;
    // ข้อความที่ส่งคู่กับรูป (เช่นข้อความประกาศเลเวลอัป)
    children?: React.ReactNode;
}) {
    const payload = useDebouncedValue(input, 250);
    const preview = useQuery({
        queryKey: [...queryKey, 'preview', kind, payload],
        queryFn: ({ signal }) => fetcher(payload, signal),
        placeholderData: keepPreviousData,
        staleTime: 30_000,
        gcTime: 60_000,
        retry: false,
    });
    const imageUrl = useObjectUrl(preview.data?.image);
    const options = Object.fromEntries(kinds.map((k) => [k, PREVIEW_KIND_LABELS()[k]])) as Record<RankPreviewKind, string>;

    return (
        <div className="space-y-3">
            {kinds.length > 1 && <Segmented value={kind} options={options} onChange={onKind} />}
            <DiscordMessage>
                {children}
                <div className="relative mt-1 w-full max-w-xl overflow-hidden rounded-lg bg-black/30">
                    {preview.data ? (
                        <img src={imageUrl} alt={tr('levels.cardPreview')} className="block w-full" />
                    ) : (
                        <div className="flex aspect-[10/3] items-center justify-center p-4 text-center text-sm text-[#b5bac1]">
                            {preview.error ? tr('welcome.failedToRenderPreview', { 0: errorMessage(preview.error) }) : tr('levels.renderingPreview')}
                        </div>
                    )}
                    {preview.data && preview.error && (
                        <p className="absolute inset-x-0 bottom-0 bg-destructive/80 px-3 py-1 text-xs text-white">{errorMessage(preview.error)}</p>
                    )}
                    {preview.isFetching && preview.data && <Spinner className="absolute top-2 right-2 size-4 text-white/80" />}
                </div>
            </DiscordMessage>
        </div>
    );
}
