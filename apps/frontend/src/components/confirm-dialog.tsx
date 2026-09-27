import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
    title: string;
    description?: ReactNode;
    confirmText?: string;
    cancelText?: string;
    // ปุ่มยืนยันสีแดง (ลบ / ปิดใช้งาน / ถอนสิทธิ์)
    destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

// กล่องยืนยันกลางของทั้งระบบ — เรียกแบบ await confirm({...}) ได้จากทุกหน้า
export function ConfirmProvider({ children }: { children: ReactNode }) {
    const [options, setOptions] = useState<ConfirmOptions | null>(null);
    const resolver = useRef<((value: boolean) => void) | null>(null);

    const confirm = useCallback<ConfirmFn>((next) => {
        resolver.current?.(false);
        setOptions(next);
        return new Promise<boolean>((resolve) => {
            resolver.current = resolve;
        });
    }, []);

    const close = (value: boolean) => {
        resolver.current?.(value);
        resolver.current = null;
        setOptions(null);
    };

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog open={options !== null} onOpenChange={(open) => !open && close(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{options?.title}</AlertDialogTitle>
                        {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => close(false)}>{options?.cancelText ?? 'ยกเลิก'}</AlertDialogCancel>
                        <AlertDialogAction variant={options?.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
                            {options?.confirmText ?? 'ยืนยัน'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    );
}

export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) throw new Error('useConfirm ต้องอยู่ภายใต้ <ConfirmProvider>');
    return confirm;
}
