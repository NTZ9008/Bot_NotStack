// ==========================================
// แปลง markdown ของ GitHub (GFM) ให้แสดงใน Discord ได้ใกล้เคียงที่สุด
// Discord รองรับ bold / italic / ~~strike~~ / `code` / ```block``` / > quote / list / [link](url) อยู่แล้ว
// ส่วนที่ Discord ไม่มี (heading ใหญ่, รูป, task list, HTML) แปลงเป็นแบบที่ใกล้เคียง
// ==========================================
import { trimChar } from '@notstack/shared/text';

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/;
const TAG = /<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>/g;

function inlineHtml(text: string): string {
    text = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, '[🖼️ image]($1)')
        .replace(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
        .replace(/<summary>([\s\S]*?)<\/summary>/gi, '**▸ $1**\n')
        .replace(/<\/?(?:b|strong)>/gi, '**')
        .replace(/<\/?(?:i|em)>/gi, '*')
        .replace(/<\/?(?:s|del|strike)>/gi, '~~')
        .replace(/<\/?(?:code|kbd)>/gi, '`');
    return stripRepeated(text, TAG);
}

// ลบซ้ำจนไม่เปลี่ยน — กันกรณีซ้อนกันอย่าง <scr<b>ipt> หรือ <!<!---->-- ที่ลบรอบเดียวแล้วประกอบกลับเป็น tag
function stripRepeated(text: string, pattern: RegExp): string {
    let prev;
    do {
        prev = text;
        text = text.replace(pattern, '');
    } while (text !== prev);
    return text;
}

function convertLine(line: string): string {
    const heading = /^\s{0,3}#{1,6}\s+(\S.*)$/.exec(line);
    // heading ของ Discord ใหญ่เกินไปสำหรับ comment สั้นๆ ใช้ตัวหนาแทน (ตัด # ปิดท้ายออก)
    const title = heading ? trimChar(heading[1]!.trimEnd(), '#', 'end').trimEnd() : '';
    if (title) line = `**${title}**`;
    else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return '───';
    line = line.replace(/^(\s*)[-*+]\s+\[([ xX])\]\s+/, (_, indent: string, mark: string) => `${indent}- ${mark === ' ' ? '☐' : '☑'} `);

    // ไม่แตะข้อความใน `inline code`
    const converted = line
        .split(/(`[^`\n]+`)/)
        .map((part, index) => {
            if (index % 2) return part;
            return inlineHtml(part.replace(/!\[([^[\]]*)\]\(([^)\s]+)(?:\s[^)]*)?\)/g, (_, alt: string, url: string) => `[🖼️ ${alt.trim() || 'image'}](${url})`));
        })
        .join('');
    // <br> ใน > quote ต้องขึ้นบรรทัดใหม่ที่ยังอยู่ใน quote
    const quote = line.match(/^\s*(?:>\s?)+/)?.[0];
    return quote ? converted.replace(/\n/g, `\n${quote}`) : converted;
}

// ตัดให้ไม่เกิน limit โดยไม่ทิ้ง code block ค้างไว้ (ไม่งั้นข้อความที่เหลือทั้ง embed จะกลายเป็น code)
export function truncateMarkdown(text: string, limit: number): string {
    if (text.length <= limit) return text;
    let cut = text.slice(0, Math.max(0, limit - 6));
    const lastBreak = cut.lastIndexOf('\n');
    if (lastBreak > cut.length * 0.6) cut = cut.slice(0, lastBreak);
    cut = cut.trimEnd();
    const openFence = (cut.match(/^[ \t]*```/gm) ?? []).length % 2 === 1;
    return openFence ? `${cut}\n…\n\`\`\`` : `${cut} …`;
}

export function githubMarkdownToDiscord(body: string, limit: number): string {
    const out: string[] = [];
    let fence: string | null = null;
    for (const line of stripRepeated(body.replace(/\r\n?/g, '\n'), /<!--[\s\S]*?-->/g)
        .replace(/<!--/g, '')
        .split('\n')) {
        const marker = line.match(FENCE);
        if (fence) {
            if (marker && marker[1]!.startsWith(fence)) {
                fence = null;
                out.push('```');
            } else out.push(line);
            continue;
        }
        if (marker) {
            fence = marker[1]!;
            // ```suggestion ของ GitHub คือโค้ดที่เสนอให้แก้
            if (marker[2] === 'suggestion') out.push('**Suggested change:**');
            out.push(`\`\`\`${marker[2] === 'suggestion' ? '' : (marker[2] ?? '')}`);
            continue;
        }
        out.push(convertLine(line));
    }
    if (fence) out.push('```');
    const text = out
        .join('\n')
        .split('\n')
        .map((line) => line.trimEnd())
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return truncateMarkdown(text, limit);
}
