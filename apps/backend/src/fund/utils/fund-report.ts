import { formatBaht, roundMoney, type FundMemberView, type FundTopicDetail } from '@notstack/shared';
import { EmbedBuilder, type MessageCreateOptions } from 'discord.js';

const DESCRIPTION_LIMIT = 4000;
const CONTENT_LIMIT = 1900;
// ข้อความ 1 ข้อความใส่ embed ได้ไม่เกิน 10 อัน (อันแรกเป็นสรุป)
const MAX_LIST_EMBEDS = 9;

const STATUS_ICON: Record<FundMemberView['status'], string> = { paid: '✅', partial: '🟡', unpaid: '❌' };

export function progressBar(ratio: number, width = 16): string {
    const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
    const filled = Math.round(clamped * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)} ${Math.round(clamped * 100)}%`;
}

function memberLine(member: FundMemberView): string {
    const amount = member.status === 'paid' ? formatBaht(member.paid) : `${formatBaht(member.paid)} / ${formatBaht(member.target)}`;
    const remain = member.status === 'paid' ? '' : ` · ค้าง ${formatBaht(member.remaining)}`;
    return `${STATUS_ICON[member.status]} <@${member.userId}> — ${amount}${remain}`;
}

// แบ่งบรรทัดใส่หลาย embed ไม่ให้เกินความยาว description
function chunkLines(lines: string[]): string[] {
    const chunks: string[] = [];
    let current = '';
    for (const line of lines) {
        if (current && current.length + line.length + 1 > DESCRIPTION_LIMIT) {
            chunks.push(current);
            current = '';
        }
        current = current ? `${current}\n${line}` : line;
    }
    if (current) chunks.push(current);
    return chunks;
}

// ==========================================
// 📊 รายงานการเก็บเงิน — embed สรุปยอด + รายชื่อแยกตามสถานะ (ค้างจ่ายขึ้นก่อน)
// ==========================================
export function buildFundReport(topic: FundTopicDetail, options: { mentionUnpaid: boolean }): MessageCreateOptions {
    const remaining = roundMoney(topic.members.reduce((sum, m) => sum + m.remaining, 0));
    const ratio = topic.target > 0 ? topic.collected / topic.target : topic.memberCount > 0 ? 1 : 0;
    const done = topic.memberCount > 0 && topic.paidCount === topic.memberCount;

    const summary = new EmbedBuilder()
        .setColor(done ? 0x22c55e : topic.closed ? 0x64748b : 0xf59e0b)
        .setTitle(`💰 รายงานการเก็บเงิน: ${topic.name}`.slice(0, 256))
        .setDescription(
            [
                topic.description ? `${topic.description}\n` : '',
                `\`${progressBar(ratio)}\``,
                topic.closed ? '\n🔒 **ปิดการเก็บเงินแล้ว**' : '',
            ]
                .join('\n')
                .trim()
                .slice(0, DESCRIPTION_LIMIT),
        )
        .addFields(
            { name: '🎯 ยอดเป้าหมาย', value: formatBaht(topic.target), inline: true },
            { name: '💵 เก็บได้แล้ว', value: formatBaht(topic.collected), inline: true },
            { name: '⏳ คงค้าง', value: formatBaht(remaining), inline: true },
            { name: '👥 จ่ายครบแล้ว', value: `${topic.paidCount} / ${topic.memberCount} คน`, inline: true },
            { name: '🧾 ยอดต่อคน', value: formatBaht(topic.amountPerMember), inline: true },
        )
        .setFooter({ text: 'NotStack • ระบบเก็บเงิน' })
        .setTimestamp();
    if (topic.dueDate) {
        summary.addFields({ name: '📅 ครบกำหนด', value: `<t:${Math.floor(new Date(topic.dueDate).getTime() / 1000)}:D>`, inline: true });
    }

    const order: Record<FundMemberView['status'], number> = { unpaid: 0, partial: 1, paid: 2 };
    const sorted = [...topic.members].sort((a, b) => order[a.status] - order[b.status] || a.displayName.localeCompare(b.displayName, 'th'));
    const chunks = chunkLines(sorted.map(memberLine));
    const embeds = [summary];
    chunks.slice(0, MAX_LIST_EMBEDS).forEach((chunk, index) => {
        embeds.push(
            new EmbedBuilder()
                .setColor(0x6366f1)
                .setTitle(index === 0 ? '📋 รายชื่อ' : '📋 รายชื่อ (ต่อ)')
                .setDescription(chunk),
        );
    });
    if (chunks.length > MAX_LIST_EMBEDS) {
        embeds[embeds.length - 1].setFooter({ text: `…และอีก ${chunks.length - MAX_LIST_EMBEDS} ส่วน (ดูทั้งหมดได้ที่ Dashboard)` });
    }
    if (topic.members.length === 0) summary.addFields({ name: '📋 รายชื่อ', value: 'ยังไม่มีคนในหัวข้อนี้' });

    // แท็กคนที่ยังจ่ายไม่ครบ (embed ไม่ทำให้ใครโดนแท็ก จึงต้องใส่ใน content)
    const unpaid = sorted.filter((m) => m.status !== 'paid');
    if (options.mentionUnpaid && unpaid.length > 0) {
        let content = '🔔 ยังจ่ายไม่ครบ:';
        const mentioned: string[] = [];
        for (const member of unpaid) {
            const mention = ` <@${member.userId}>`;
            if (content.length + mention.length > CONTENT_LIMIT) break;
            content += mention;
            mentioned.push(member.userId);
        }
        return { content, embeds, allowedMentions: { users: mentioned, parse: [] } };
    }
    return { embeds, allowedMentions: { parse: [] } };
}
