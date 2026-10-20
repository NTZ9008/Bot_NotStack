import { formatBaht, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { useMutation } from '@tanstack/react-query';
import { Pencil, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { fundApi } from '@/api/fund';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useGuildId } from '@/hooks/use-guild';
import { cn } from '@/lib/utils';
import { onFundError, useFundRefresh } from './utils';

type MemberPatch = { targetAmount?: number | null; paidAmount?: number };

// แก้ยอดของคนหนึ่งคนจากในตาราง แล้วโหลดข้อมูลหัวข้อใหม่
function useMemberUpdate(topic: FundTopicDetail, member: FundMemberView, successMessage: string, onDone: () => void) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    return useMutation({
        mutationFn: (patch: MemberPatch) => fundApi.updateMember(guildId, topic.id, member.id, patch),
        onSuccess: () => {
            toast.success(successMessage);
            onDone();
            void refresh();
        },
        onError: onFundError,
    });
}

// ปุ่มตัวเลข (กดเพื่อแก้) ↔ ฟอร์มกรอกยอดในแถวตาราง
function InlineAmountEditor({
    value,
    title,
    editing,
    onEditingChange,
    align = 'left',
    buttonClassName,
    pending,
    onSave,
    extraActions,
    children,
}: {
    value: number;
    title: string;
    editing: boolean;
    onEditingChange: (editing: boolean) => void;
    align?: 'left' | 'right';
    buttonClassName?: string;
    pending: boolean;
    onSave: (amount: number) => void;
    extraActions?: ReactNode;
    children: ReactNode;
}) {
    const [input, setInput] = useState('');

    if (!editing) {
        return (
            <button
                type="button"
                className={cn(
                    'group inline-flex items-center gap-1.5 rounded px-1 tabular-nums hover:bg-muted',
                    align === 'right' ? 'justify-end text-right' : 'text-left',
                    buttonClassName,
                )}
                onClick={() => {
                    setInput(String(value));
                    onEditingChange(true);
                }}
                title={title}
            >
                {children}
            </button>
        );
    }
    return (
        <form
            className={cn('flex items-center gap-1', align === 'right' && 'justify-end')}
            onSubmit={(event) => {
                event.preventDefault();
                onSave(Number(input || 0));
            }}
        >
            <Input
                type="number"
                min={0}
                step="0.01"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className={cn('h-7 w-24', align === 'right' && 'text-right')}
                autoFocus
            />
            <Button type="submit" size="xs" disabled={pending}>
                บันทึก
            </Button>
            {extraActions}
            <Button type="button" size="icon-xs" variant="ghost" onClick={() => onEditingChange(false)} aria-label="ยกเลิก">
                <X />
            </Button>
        </form>
    );
}

const CustomTargetBadge = () => (
    <Badge variant="outline" className="text-[10px]">
        เฉพาะคน
    </Badge>
);

// ==========================================
// 🎯 ยอดต้องจ่ายเฉพาะคน (กดที่ยอดเพื่อแก้)
// ==========================================
export function TargetCell({ topic, member }: { topic: FundTopicDetail; member: FundMemberView }) {
    const [editing, setEditing] = useState(false);
    const update = useMemberUpdate(topic, member, 'บันทึกยอดที่ต้องจ่ายแล้ว', () => setEditing(false));

    if (topic.closed) {
        return (
            <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
                {formatBaht(member.target)}
                {member.customTarget && <CustomTargetBadge />}
            </span>
        );
    }
    return (
        <InlineAmountEditor
            value={member.target}
            title="กดเพื่อตั้งยอดเฉพาะคนนี้"
            editing={editing}
            onEditingChange={setEditing}
            pending={update.isPending}
            onSave={(targetAmount) => update.mutate({ targetAmount })}
            extraActions={
                member.customTarget && (
                    <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => update.mutate({ targetAmount: null })}
                        title={`กลับไปใช้ยอดต่อคน (${formatBaht(topic.amountPerMember)})`}
                    >
                        ใช้ยอดกลาง
                    </Button>
                )
            }
        >
            {formatBaht(member.target)}
            {member.customTarget && <CustomTargetBadge />}
            <Pencil className="size-3 opacity-0 group-hover:opacity-60" />
        </InlineAmountEditor>
    );
}

// ==========================================
// 💰 ยอดจ่ายแล้วรายคน (กดที่ยอดเพื่อแก้ไขยอดที่จ่ายแล้วได้โดยตรง)
// ==========================================
export function PaidCell({ topic, member }: { topic: FundTopicDetail; member: FundMemberView }) {
    const [editing, setEditing] = useState(false);
    const update = useMemberUpdate(topic, member, 'แก้ไขยอดที่จ่ายแล้วเรียบร้อย', () => setEditing(false));

    if (topic.closed) {
        return <span className="tabular-nums font-medium text-emerald-400">{formatBaht(member.paid)}</span>;
    }
    return (
        <InlineAmountEditor
            value={member.paid}
            title="กดเพื่อแก้ไขยอดที่จ่ายแล้วของคนนี้"
            editing={editing}
            onEditingChange={setEditing}
            align="right"
            buttonClassName="font-medium text-emerald-400"
            pending={update.isPending}
            onSave={(paidAmount) => update.mutate({ paidAmount })}
        >
            {formatBaht(member.paid)}
            <Pencil className="size-3 text-foreground opacity-0 group-hover:opacity-60" />
        </InlineAmountEditor>
    );
}
