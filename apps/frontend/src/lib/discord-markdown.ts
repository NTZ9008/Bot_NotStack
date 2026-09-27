// ==========================================
// 🖍️ แปลง Markdown ของ Discord เป็น HTML สำหรับหน้าตัวอย่าง (ใกล้เคียงของจริงที่สุด)
// escape ก่อนเสมอ แล้วค่อยใส่แท็ก — ข้อความจากผู้ใช้จึงกลายเป็นโค้ดไม่ได้
// ==========================================
export function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderDiscordMarkdown(text: string): string {
    if (!text) return '';

    const codeBlocks: string[] = [];
    let html = escapeHtml(text);

    // เก็บบล็อกโค้ดไว้ก่อน เพื่อไม่ให้ถูกกฎอื่นแปลงทับ
    html = html.replace(/```(?:[a-zA-Z0-9+#-]*\n)?([\s\S]*?)```/g, (_, code: string) => {
        codeBlocks.push(`<pre class="dc-codeblock">${code.replace(/^\n|\n$/g, '')}</pre>`);
        return ` CB${codeBlocks.length - 1} `;
    });
    html = html.replace(/`([^`\n]+)`/g, (_, code: string) => {
        codeBlocks.push(`<code class="dc-code">${code}</code>`);
        return ` CB${codeBlocks.length - 1} `;
    });

    // หัวข้อและอ้างอิง (ทำงานทีละบรรทัด)
    html = html
        .replace(/^### (.*)$/gm, '<div class="dc-h3">$1</div>')
        .replace(/^## (.*)$/gm, '<div class="dc-h2">$1</div>')
        .replace(/^# (.*)$/gm, '<div class="dc-h1">$1</div>')
        .replace(/^&gt; (.*)$/gm, '<div class="dc-quote">$1</div>')
        .replace(/^[-*] (.*)$/gm, '<div class="dc-li">$1</div>');

    // ตัวหนา/เอียง/ขีดเส้นใต้ ต้องเรียงจากสัญลักษณ์ยาวไปสั้น
    html = html
        .replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/__([^_]+)__/g, '<u>$1</u>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>')
        .replace(/~~([^~]+)~~/g, '<s>$1</s>')
        .replace(/\|\|([^|]+)\|\|/g, '<span class="dc-spoiler">$1</span>');

    // ลิงก์ — รับเฉพาะ http/https กัน javascript: ที่ผู้ใช้อาจพิมพ์เข้ามา
    html = html.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label: string, url: string) => `<a class="dc-link" href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    html = html.replace(
        /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
        (_, lead: string, url: string) => `${lead}<a class="dc-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
    );

    html = html.replace(/\n/g, '<br>');
    // แท็กระดับบล็อกไม่ต้องมี <br> ต่อท้ายซ้ำอีก
    html = html.replace(/(<\/div>)<br>/g, '$1');

    return html.replace(/ CB(\d+) /g, (_, i: string) => codeBlocks[Number(i)] ?? '');
}
