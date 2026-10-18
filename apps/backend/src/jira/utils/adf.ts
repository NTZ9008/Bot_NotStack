// ==========================================
// 📝 ข้อความธรรมดา → Atlassian Document Format (รูปแบบ description ของ Jira REST API v3)
// บรรทัดว่างแบ่งย่อหน้า, ขึ้นบรรทัดใหม่ภายในย่อหน้า = hardBreak
// ==========================================
type AdfInline = { type: 'text'; text: string } | { type: 'hardBreak' };
interface AdfParagraph {
    type: 'paragraph';
    content: AdfInline[];
}
export interface AdfDoc {
    type: 'doc';
    version: 1;
    content: AdfParagraph[];
}

export function textToAdf(text: string): AdfDoc {
    const paragraphs = text
        .replace(/\r\n?/g, '\n')
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block): AdfParagraph => {
            const content: AdfInline[] = [];
            block.split('\n').forEach((line, index) => {
                if (index > 0) content.push({ type: 'hardBreak' });
                // ADF ไม่รับ text node ว่าง
                if (line) content.push({ type: 'text', text: line });
            });
            return { type: 'paragraph', content };
        });
    return { type: 'doc', version: 1, content: paragraphs };
}
