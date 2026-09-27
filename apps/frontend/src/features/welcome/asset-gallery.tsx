import { WELCOME_UPLOAD_TYPES, type WelcomeAsset, type WelcomeCard, type WelcomeMeta } from '@notstack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { assetImageUrl, welcomeApi, welcomeAssetsQuery, welcomeCardsQuery } from '@/api/welcome';
import { useConfirm } from '@/components/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useGuildId } from '@/hooks/use-guild';

// ==========================================
// 🖼️ คลังรูปพื้นหลัง — ใช้ร่วมกันทุกการ์ด (อัปโหลด / เปลี่ยนชื่อ / ลบ / เลือกเป็นพื้นหลัง)
// ==========================================
export function AssetGallery({
    meta,
    assets,
    cards,
    selectedId,
    backgroundColor,
    onSelect,
    onDeleted,
}: {
    meta: WelcomeMeta;
    assets: WelcomeAsset[];
    cards: WelcomeCard[];
    selectedId: number | null;
    backgroundColor: string;
    onSelect: (assetId: number | null) => void;
    // การ์ดที่ใช้รูปที่ถูกลบจะกลับไปใช้สีพื้น (server ตั้ง background เป็น null ให้แล้ว)
    onDeleted: (assetId: number) => void;
}) {
    const guildId = useGuildId();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const fileInput = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [renaming, setRenaming] = useState<WelcomeAsset | null>(null);
    const [newName, setNewName] = useState('');
    const maxBytes = meta.limits.maxUploadBytes;

    // จำนวนการ์ด (ที่บันทึกแล้ว) ที่ใช้รูปนี้เป็นพื้นหลัง
    const usage = (assetId: number) => cards.filter((card) => card.backgroundId === assetId).length;

    const upload = async (file: File) => {
        if (!(WELCOME_UPLOAD_TYPES as readonly string[]).includes(file.type)) return toast.error('อัปโหลดไม่ได้', { description: 'รองรับเฉพาะไฟล์ PNG, JPG, WEBP และ GIF' });
        if (file.size > maxBytes) return toast.error('ไฟล์ใหญ่เกินไป', { description: `ขนาดไฟล์ต้องไม่เกิน ${formatBytes(maxBytes)}` });
        setUploading(true);
        try {
            const { asset } = await welcomeApi.uploadAsset(guildId, file);
            queryClient.setQueryData<WelcomeAsset[]>(welcomeAssetsQuery(guildId).queryKey, (list = []) => [asset, ...list]);
            onSelect(asset.id);
            toast.success('อัปโหลดรูปแล้ว', { description: 'เลือกเป็นพื้นหลังให้แล้ว — อย่าลืมกดบันทึก' });
        } catch (err) {
            toast.error('อัปโหลดรูปไม่สำเร็จ', { description: errorMessage(err) });
        } finally {
            setUploading(false);
        }
    };

    const rename = async () => {
        if (!renaming || !newName.trim()) return;
        try {
            const { asset } = await welcomeApi.renameAsset(guildId, renaming.id, newName.trim());
            queryClient.setQueryData<WelcomeAsset[]>(welcomeAssetsQuery(guildId).queryKey, (list = []) => list.map((a) => (a.id === asset.id ? asset : a)));
            setRenaming(null);
        } catch (err) {
            toast.error('เปลี่ยนชื่อรูปไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const remove = async (asset: WelcomeAsset) => {
        const usedBy = usage(asset.id);
        const ok = await confirm({
            title: `ลบรูป "${asset.name}" ออกจากคลัง?`,
            description: usedBy ? `มีการ์ด ${usedBy} ใบใช้รูปนี้อยู่ — การ์ดเหล่านั้นจะกลับไปใช้สีพื้นแทน (ลบแล้วกู้คืนไม่ได้)` : 'ลบแล้วกู้คืนไม่ได้',
            confirmText: 'ลบรูป',
            destructive: true,
        });
        if (!ok) return;
        try {
            await welcomeApi.deleteAsset(guildId, asset.id);
            queryClient.setQueryData<WelcomeAsset[]>(welcomeAssetsQuery(guildId).queryKey, (list = []) => list.filter((a) => a.id !== asset.id));
            queryClient.setQueryData<WelcomeCard[]>(welcomeCardsQuery(guildId).queryKey, (list = []) =>
                list.map((card) => (card.backgroundId === asset.id ? { ...card, backgroundId: null } : card)),
            );
            onDeleted(asset.id);
            toast.success('ลบรูปแล้ว');
        } catch (err) {
            toast.error('ลบรูปไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const tileClass = (selected: boolean) =>
        cn(
            'group relative flex flex-col overflow-hidden rounded-lg border bg-muted/30 text-left transition-colors hover:border-primary/60',
            selected && 'border-primary ring-2 ring-primary/40',
        );

    return (
        <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <button type="button" className={tileClass(selectedId === null)} onClick={() => onSelect(null)}>
                    <span className="block aspect-video w-full" style={{ background: backgroundColor }} />
                    <span className="px-2 pt-1.5 text-xs font-medium">ไม่ใช้รูป</span>
                    <span className="px-2 pb-1.5 text-[11px] text-muted-foreground">ใช้สีพื้นอย่างเดียว</span>
                </button>

                {assets.map((asset) => {
                    const usedBy = usage(asset.id);
                    return (
                        <div key={asset.id} className={tileClass(asset.id === selectedId)}>
                            <button type="button" className="text-left" onClick={() => onSelect(asset.id)} title={asset.name}>
                                <img src={assetImageUrl(guildId, asset.id)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
                                <span className="block truncate px-2 pt-1.5 text-xs font-medium">{asset.name}</span>
                                <span className="block truncate px-2 pb-1.5 text-[11px] text-muted-foreground">
                                    {asset.width}×{asset.height} · {formatBytes(asset.size)}
                                    {usedBy ? ` · ใช้ ${usedBy} การ์ด` : ''}
                                </span>
                            </button>
                            <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <Button
                                    size="icon-xs"
                                    variant="secondary"
                                    title="เปลี่ยนชื่อ"
                                    onClick={() => {
                                        setRenaming(asset);
                                        setNewName(asset.name);
                                    }}
                                >
                                    <Pencil />
                                </Button>
                                <Button size="icon-xs" variant="destructive" title="ลบออกจากคลัง" onClick={() => void remove(asset)}>
                                    <Trash2 />
                                </Button>
                            </div>
                        </div>
                    );
                })}

                <button
                    type="button"
                    className={cn(tileClass(false), 'items-center justify-center gap-1 border-dashed p-3 text-center')}
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                >
                    {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                    <span className="text-xs font-medium">อัปโหลดรูป</span>
                    <span className="text-[11px] text-muted-foreground">PNG · JPG · WEBP · GIF ไม่เกิน {formatBytes(maxBytes)}</span>
                </button>
                <input
                    ref={fileInput}
                    type="file"
                    accept={WELCOME_UPLOAD_TYPES.join(',')}
                    hidden
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void upload(file);
                        e.target.value = '';
                    }}
                />
            </div>

            <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>เปลี่ยนชื่อรูป</DialogTitle>
                    </DialogHeader>
                    <form
                        className="space-y-4"
                        onSubmit={(e) => {
                            e.preventDefault();
                            void rename();
                        }}
                    >
                        <Input autoFocus maxLength={meta.limits.maxNameLength} value={newName} onChange={(e) => setNewName(e.target.value)} />
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setRenaming(null)}>
                                ยกเลิก
                            </Button>
                            <Button type="submit" disabled={!newName.trim()}>
                                บันทึก
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
