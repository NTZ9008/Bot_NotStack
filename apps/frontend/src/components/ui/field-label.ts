import { createContext, useContext } from 'react';

// Field ส่ง id ของป้ายชื่อลงมา → Input/Textarea/SelectTrigger ที่ไม่มีชื่อของตัวเองใช้เป็น aria-labelledby
export const FieldLabelContext = createContext<string | undefined>(undefined);

export function useFieldLabelledBy(props: { id?: string; 'aria-label'?: string; 'aria-labelledby'?: string }): string | undefined {
    const labelId = useContext(FieldLabelContext);
    return props['aria-labelledby'] ?? (props.id || props['aria-label'] ? undefined : labelId);
}
