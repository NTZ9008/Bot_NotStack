// ==========================================
// 📡 ตัวแยกข้อความ Server-Sent Events (text/event-stream) — รับข้อความทีละก้อนตามที่เครือข่ายส่งมา
// ก้อนอาจขาดกลางบรรทัดหรือกลางข้อความ จึงเก็บส่วนที่เหลือไว้รวมกับก้อนถัดไป
// ==========================================

export interface SseMessage {
    event: string;
    data: string;
}

export function createSseParser(onMessage: (message: SseMessage) => void): (chunk: string) => void {
    let buffer = '';
    let event = '';
    let data: string[] = [];

    const dispatch = () => {
        if (data.length) onMessage({ event: event || 'message', data: data.join('\n') });
        event = '';
        data = [];
    };

    return (chunk: string) => {
        buffer += chunk;
        let index: number;
        while ((index = buffer.search(/\r\n|\r|\n/)) >= 0) {
            // \r ตัวสุดท้ายของก้อน อาจเป็นครึ่งแรกของ \r\n — รอก้อนถัดไปก่อน
            if (index === buffer.length - 1 && buffer.endsWith('\r')) break;
            const line = buffer.slice(0, index);
            buffer = buffer.slice(index + (buffer.startsWith('\r\n', index) ? 2 : 1));
            if (line === '') {
                dispatch();
                continue;
            }
            // บรรทัดที่ขึ้นต้นด้วย : คือ comment (ใช้เป็น ping กัน proxy ตัดการเชื่อมต่อ)
            if (line.startsWith(':')) continue;
            const colon = line.indexOf(':');
            const field = colon < 0 ? line : line.slice(0, colon);
            const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
            if (field === 'event') event = value;
            else if (field === 'data') data.push(value);
        }
    };
}
