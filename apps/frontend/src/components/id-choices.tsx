import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// เลือก id หลายรายการ (ยศ / ห้อง) แบบมีช่องค้นหา — id ที่เลือกไว้แต่หาไม่เจอใน Discord แล้วยังแสดงไว้ให้เอาออกได้
export function IdChoices({
    title,
    options,
    values,
    onChange,
    voiceIds,
    emptyHint,
}: {
    title: string;
    options: { id: string; name: string }[];
    values: string[];
    onChange: (v: string[]) => void;
    voiceIds?: string[];
    emptyHint?: string;
}) {
    const [search, setSearch] = useState('');
    const all = [...options, ...values.filter((id) => !options.some((o) => o.id === id)).map((id) => ({ id, name: `${id} (ไม่พบใน Discord)` }))];
    return (
        <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm">
                {title} · เลือก {values.length}
            </summary>
            <div className="my-2 flex flex-wrap gap-2">
                {voiceIds && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!voiceIds.length || voiceIds.every((id) => values.includes(id))}
                        onClick={() => {
                            const next = [...new Set([...values, ...voiceIds])];
                            if (next.length > 100) {
                                toast.error('เลือกได้สูงสุด 100 รายการ', {
                                    description: 'หากต้องการให้กฎเสียงใช้ได้ทุกห้อง ให้ล้างการเลือกห้องของกฎนี้',
                                });
                                return;
                            }
                            onChange(next);
                        }}
                    >
                        เลือกห้องเสียงทั้งหมด
                    </Button>
                )}
                <Button type="button" size="sm" variant="ghost" disabled={!values.length} onClick={() => onChange([])}>
                    ล้างการเลือก
                </Button>
            </div>
            {emptyHint && <p className="mb-2 text-xs text-muted-foreground">{emptyHint}</p>}
            <Input aria-label={`ค้นหา${title}`} placeholder="ค้นหาชื่อหรือ ID" value={search} onChange={(e) => setSearch(e.target.value)} className="my-2" />
            <div className="grid max-h-48 gap-2 overflow-y-auto">
                {all
                    .filter((o) => `${o.name} ${o.id}`.toLowerCase().includes(search.toLowerCase()))
                    .map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={values.includes(o.id)}
                                disabled={!values.includes(o.id) && values.length >= 100}
                                onChange={(e) => onChange(e.target.checked ? [...values, o.id] : values.filter((id) => id !== o.id))}
                            />
                            {o.name}
                        </label>
                    ))}
                {!all.length && <p className="text-xs text-muted-foreground">ยังไม่มีรายการให้เลือก</p>}
            </div>
        </details>
    );
}
