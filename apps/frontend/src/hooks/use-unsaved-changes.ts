import { useBlocker } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useConfirm, type ConfirmOptions } from '@/components/confirm-dialog';

// ออกจากหน้า (หรือปิดแท็บ) ตอนมีการแก้ไขที่ยังไม่บันทึก → ถามก่อนทิ้งการแก้ไข
export function useUnsavedChangesGuard(dirty: boolean, dialog: ConfirmOptions): void {
    const confirm = useConfirm();
    useBlocker({
        shouldBlockFn: async () => dirty && !(await confirm(dialog)),
        enableBeforeUnload: () => dirty,
    });
}

// Ctrl/⌘ + S = บันทึก (เรียกฟังก์ชันล่าสุดเสมอ ไม่ต้องผูก event ใหม่ทุกครั้งที่ render)
export function useSaveShortcut(onSave: () => void): void {
    const latest = useRef(onSave);
    useEffect(() => {
        latest.current = onSave;
    });
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault();
                latest.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);
}
