import { Injectable } from '@nestjs/common';
import { JIRA_SITE_RE } from '@notstack/shared';
import { textToAdf } from '../utils/adf';

const TIMEOUT_MS = 10_000;
// อัปโหลดรูป (สูงสุด 25MB ต่อไฟล์) ใช้เวลานานกว่า request ปกติ
const UPLOAD_TIMEOUT_MS = 60_000;

export interface JiraCredentials {
    siteUrl: string;
    email: string;
    apiToken: string;
}

export interface JiraProjectInfo {
    name: string;
    issueTypes: { id: string; name: string; description: string; iconUrl: string }[];
}

export interface CreatedIssue {
    key: string;
    url: string;
}

export interface UploadFile {
    name: string;
    contentType: string;
    data: Buffer;
}

// error จาก Jira ที่แปลเป็นข้อความภาษาไทยแล้ว (แสดงให้ผู้ใช้ได้เลย)
export class JiraApiError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

interface JiraErrorBody {
    errorMessages?: unknown;
    errors?: unknown;
}

// รวมข้อความ error ของ Jira (errorMessages + errors ของแต่ละฟิลด์) ให้อ่านรู้เรื่อง
function jiraErrorDetail(body: unknown): string {
    if (!body || typeof body !== 'object') return '';
    const { errorMessages, errors } = body as JiraErrorBody;
    const parts = [
        ...(Array.isArray(errorMessages) ? errorMessages.filter((m): m is string => typeof m === 'string') : []),
        ...(errors && typeof errors === 'object' ? Object.entries(errors).map(([field, msg]) => `${field}: ${String(msg)}`) : []),
    ];
    return parts.join(' · ').slice(0, 500);
}

// ==========================================
// 🧩 JIRA CLOUD REST API v3 — ตรวจบัญชี, อ่านโปรเจกต์ (+ ประเภท issue), สร้าง issue, แนบไฟล์
// ยิงได้เฉพาะ https://*.atlassian.net (ตรวจซ้ำที่นี่อีกชั้น ไม่พึ่งแค่ validation ของหน้าเว็บ)
// ==========================================
@Injectable()
export class JiraClient {
    // เปลี่ยนได้ในเทสต์
    fetchImpl: typeof fetch = (...args) => fetch(...args);

    // body = JSON, form = multipart (แนบไฟล์)
    private async request<T>(creds: JiraCredentials, path: string, init: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
        if (!JIRA_SITE_RE.test(creds.siteUrl)) throw new JiraApiError('Jira site URL ไม่ถูกต้อง (รองรับเฉพาะ https://<ชื่อ>.atlassian.net)', 400);
        if (!creds.email || !creds.apiToken) throw new JiraApiError('ยังไม่ได้ตั้งอีเมลหรือ API token ของ Jira', 400);

        let res: Response;
        try {
            res = await this.fetchImpl(`${creds.siteUrl}${path}`, {
                method: init.method ?? 'GET',
                headers: {
                    Authorization: `Basic ${Buffer.from(`${creds.email}:${creds.apiToken}`).toString('base64')}`,
                    Accept: 'application/json',
                    ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
                    // Jira บังคับ header นี้กับ request แนบไฟล์ (กัน CSRF) — fetch ใส่ Content-Type multipart ให้เอง
                    ...(init.form ? { 'X-Atlassian-Token': 'no-check' } : {}),
                },
                body: init.form ?? (init.body !== undefined ? JSON.stringify(init.body) : undefined),
                redirect: 'error',
                signal: AbortSignal.timeout(init.form ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS),
            });
        } catch (err) {
            const timeout = err instanceof Error && err.name === 'TimeoutError';
            throw new JiraApiError(timeout ? 'Jira ไม่ตอบกลับภายในเวลาที่กำหนด' : 'เชื่อมต่อ Jira ไม่ได้ — ตรวจ site URL อีกครั้ง', 502);
        }

        const body: unknown = await res.json().catch(() => null);
        if (res.ok) return body as T;

        const detail = jiraErrorDetail(body);
        if (res.status === 401) throw new JiraApiError('อีเมลหรือ API token ของ Jira ไม่ถูกต้อง', 401);
        if (res.status === 413) throw new JiraApiError('ไฟล์ใหญ่เกินที่ Jira รับได้', 400);
        if (res.status === 403) throw new JiraApiError(`บัญชี Jira นี้ไม่มีสิทธิ์${detail ? ` (${detail})` : ''}`, 403);
        if (res.status === 404) throw new JiraApiError(detail || 'ไม่พบข้อมูลใน Jira (ตรวจ project key)', 404);
        throw new JiraApiError(detail ? `Jira ตอบกลับ: ${detail}` : `Jira ตอบกลับผิดพลาด (HTTP ${res.status})`, res.status >= 500 ? 502 : 400);
    }

    async myself(creds: JiraCredentials): Promise<string> {
        const me = await this.request<{ displayName?: string; emailAddress?: string }>(creds, '/rest/api/3/myself');
        return me.displayName || me.emailAddress || creds.email;
    }

    async project(creds: JiraCredentials, projectKey: string): Promise<JiraProjectInfo> {
        const project = await this.request<{
            name?: string;
            issueTypes?: { id: string; name: string; description?: string; iconUrl?: string; subtask?: boolean }[];
        }>(creds, `/rest/api/3/project/${encodeURIComponent(projectKey)}`);
        return {
            name: project.name ?? projectKey,
            // sub-task ต้องมี parent — เปิดจาก Discord ไม่ได้
            issueTypes: (project.issueTypes ?? [])
                .filter((type) => !type.subtask)
                .map((type) => ({ id: String(type.id), name: type.name, description: type.description ?? '', iconUrl: type.iconUrl ?? '' })),
        };
    }

    async createIssue(creds: JiraCredentials, input: { projectKey: string; issueTypeId: string; summary: string; description: string }): Promise<CreatedIssue> {
        const created = await this.request<{ key: string }>(creds, '/rest/api/3/issue', {
            method: 'POST',
            body: {
                fields: {
                    project: { key: input.projectKey },
                    issuetype: { id: input.issueTypeId },
                    summary: input.summary,
                    description: textToAdf(input.description),
                },
            },
        });
        return { key: created.key, url: `${creds.siteUrl}/browse/${created.key}` };
    }

    // แนบไฟล์ 1 ไฟล์เข้า issue (ต้องมีสิทธิ์ Create attachments ในโปรเจกต์)
    async addAttachment(creds: JiraCredentials, issueKey: string, file: UploadFile): Promise<void> {
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(file.data)], { type: file.contentType }), file.name);
        await this.request(creds, `/rest/api/3/issue/${encodeURIComponent(issueKey)}/attachments`, { method: 'POST', form });
    }
}
