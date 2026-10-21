import { JIRA_LIMITS } from '@notstack/shared';
import type { UploadFile } from '../clients/jira.client';

// ไฟล์ที่ผู้ใช้แนบใน pop-up อยู่บน CDN ของ Discord เสมอ — ไม่ดาวน์โหลดจาก host อื่น
const DISCORD_CDN_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);
const TIMEOUT_MS = 30_000;

export interface DiscordImage {
    name: string;
    url: string;
    contentType: string | null;
    size: number;
}

export interface DownloadedImages {
    files: UploadFile[];
    // ไฟล์ที่ข้าม พร้อมเหตุผล (แสดงให้ผู้ใช้เห็น)
    skipped: string[];
}

// ชื่อไฟล์ใช้อ้างใน Discord (attachment://ชื่อ) จึงต้องเป็นตัวอักษรปลอดภัยและไม่ซ้ำกัน
function safeName(name: string, index: number, used: Set<string>): string {
    const dot = name.lastIndexOf('.');
    const ext =
        dot > 0
            ? name
                  .slice(dot + 1)
                  .replace(/[^a-z0-9]/gi, '')
                  .slice(0, 8)
                  .toLowerCase()
            : '';
    const base =
        (dot > 0 ? name.slice(0, dot) : name)
            .replace(/[^\w-]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 60) || `image-${index + 1}`;
    let candidate = ext ? `${base}.${ext}` : base;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = ext ? `${base}-${n}.${ext}` : `${base}-${n}`;
    used.add(candidate.toLowerCase());
    return candidate;
}

// ดาวน์โหลดรูปที่แนบมา (ทีละรูป) — ไฟล์ที่ไม่ใช่รูป / ใหญ่เกิน / โหลดไม่ได้ ถูกข้ามพร้อมเหตุผล ไม่ทำให้ทั้งหมดล้ม
export async function downloadDiscordImages(
    images: DiscordImage[],
    fetchImpl: typeof fetch,
    maxBytes: number = JIRA_LIMITS.maxImageBytes,
): Promise<DownloadedImages> {
    const files: UploadFile[] = [];
    const skipped: string[] = [];
    const used = new Set<string>();
    const limitMb = Math.round(maxBytes / 1024 / 1024);

    for (const [index, image] of images.slice(0, JIRA_LIMITS.maxImages).entries()) {
        const contentType = (image.contentType ?? '').split(';')[0]!.trim().toLowerCase();
        if (!contentType.startsWith('image/')) {
            skipped.push(`${image.name} (ไม่ใช่รูปภาพ)`);
            continue;
        }
        if (image.size > maxBytes) {
            skipped.push(`${image.name} (ใหญ่เกิน ${limitMb}MB)`);
            continue;
        }
        let url: URL;
        try {
            url = new URL(image.url);
        } catch {
            skipped.push(`${image.name} (ลิงก์ไฟล์ไม่ถูกต้อง)`);
            continue;
        }
        if (url.protocol !== 'https:' || !DISCORD_CDN_HOSTS.has(url.hostname)) {
            skipped.push(`${image.name} (ลิงก์ไฟล์ไม่ได้มาจาก Discord)`);
            continue;
        }

        try {
            const res = await fetchImpl(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = Buffer.from(await res.arrayBuffer());
            if (data.length > maxBytes) {
                skipped.push(`${image.name} (ใหญ่เกิน ${limitMb}MB)`);
                continue;
            }
            files.push({ name: safeName(image.name, index, used), contentType, data });
        } catch {
            skipped.push(`${image.name} (ดาวน์โหลดจาก Discord ไม่ได้)`);
        }
    }
    return { files, skipped };
}
