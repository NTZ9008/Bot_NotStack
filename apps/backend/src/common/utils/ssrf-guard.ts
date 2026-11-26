import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { isIP } from 'node:net';

// ==========================================
// 🛡️ SSRF GUARD — บล็อก localhost / loopback / link-local / private IP ก่อนยิง fetch ออกภายนอก
// ==========================================

export type DnsLookupAll = (hostname: string, options: { all: true; verbatim: boolean }) => Promise<LookupAddress[]>;

export interface ExternalProbeResult {
    status: 'UP' | 'DOWN';
    statusCode: number | null;
    latencyMs: number | null;
    error: string | null;
}

export class SsrfBlockedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SsrfBlockedError';
    }
}

const defaultLookup: DnsLookupAll = (hostname, options) => lookup(hostname, options);

const BLOCKED_HOSTNAMES = new Set(['localhost', 'localhost.localdomain', 'ip6-localhost', 'ip6-loopback', 'metadata', 'metadata.google.internal']);

function ipv4ToInt(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let out = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        if (part.length > 1 && part.startsWith('0')) return null;
        const octet = Number(part);
        if (octet < 0 || octet > 255) return null;
        out = ((out << 8) | octet) >>> 0;
    }
    return out;
}

function isForbiddenIpv4Int(n: number): boolean {
    const first = n >>> 24;
    // 0.0.0.0/8 ("this network"), 10.0.0.0/8, 127.0.0.0/8 (loopback)
    if (first === 0 || first === 10 || first === 127) return true;
    // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598)
    if ((n & 0xffc00000) >>> 0 === 0x64400000) return true;
    // 169.254.0.0/16 (Link-local & cloud metadata 169.254.169.254)
    if (n >>> 16 === 0xa9fe) return true;
    // 172.16.0.0/12
    if ((n & 0xfff00000) >>> 0 === 0xac100000) return true;
    // 192.0.0.0/24 (IETF protocol assignments) & 192.0.2.0/24 (TEST-NET-1)
    if (n >>> 8 === 0xc00000 || n >>> 8 === 0xc00002) return true;
    // 192.168.0.0/16
    if (n >>> 16 === 0xc0a8) return true;
    // 198.18.0.0/15 (Benchmarking) & 198.51.100.0/24 (TEST-NET-2)
    if ((n & 0xfffe0000) >>> 0 === 0xc6120000 || n >>> 8 === 0xc63364) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (n >>> 8 === 0xcb0071) return true;
    // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved + Limited Broadcast 255.255.255.255)
    if (first >= 224) return true;
    return false;
}

function parseHexSegments(segmentStr: string): number[] | null {
    if (!segmentStr) return [];
    const parts = segmentStr.split(':');
    const out: number[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        if (i === parts.length - 1 && part.includes('.')) {
            const v4 = ipv4ToInt(part);
            if (v4 === null) return null;
            out.push((v4 >>> 16) & 0xffff, v4 & 0xffff);
            continue;
        }
        if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
        out.push(Number.parseInt(part, 16));
    }
    return out;
}

function expandIpv6(raw: string): number[] | null {
    const clean = raw.replace(/^\[|\]$/g, '').split('%')[0] ?? '';
    const halves = clean.split('::');
    if (halves.length > 2) return null;

    if (halves.length === 1) {
        const groups = parseHexSegments(halves[0]!);
        return groups && groups.length === 8 ? groups : null;
    }

    const left = parseHexSegments(halves[0]!);
    const right = parseHexSegments(halves[1]!);
    if (!left || !right) return null;
    const missing = 8 - (left.length + right.length);
    if (missing < 1) return null;
    return [...left, ...new Array<number>(missing).fill(0), ...right];
}

function isForbiddenIpv6(raw: string): boolean {
    const g = expandIpv6(raw);
    if (!g) return true;

    const allZeroPrefix = g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0;
    const embeddedV4 = ((g[6]! << 16) | g[7]!) >>> 0;

    // ::/128 (unspecified) & ::1/128 (loopback)
    if (allZeroPrefix && g[5] === 0 && (embeddedV4 === 0 || embeddedV4 === 1)) return true;
    // IPv4-compatible ::/96 & IPv4-mapped ::ffff:0:0/96
    if (allZeroPrefix && (g[5] === 0 || g[5] === 0xffff)) return isForbiddenIpv4Int(embeddedV4);
    // IPv4-translated ::ffff:0:0:0/96
    if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0xffff && g[5] === 0) return isForbiddenIpv4Int(embeddedV4);
    // NAT64 64:ff9b::/96 & local NAT64 64:ff9b:1::/48
    if (g[0] === 0x0064 && g[1] === 0xff9b && ((g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) || g[2] === 1)) {
        return isForbiddenIpv4Int(embeddedV4);
    }
    // Unique Local Addresses fc00::/7
    if ((g[0]! & 0xfe00) === 0xfc00) return true;
    // Link-Local fe80::/10 & deprecated Site-Local fec0::/10
    if ((g[0]! & 0xffc0) === 0xfe80 || (g[0]! & 0xffc0) === 0xfec0) return true;
    // Multicast ff00::/8
    if ((g[0]! & 0xff00) === 0xff00) return true;
    // Discard 0100::/64
    if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true;
    // Teredo 2001::/32 & Documentation 2001:db8::/32
    if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0x0db8)) return true;
    // 6to4 2002::/16 — reject encapsulated private IPv4
    if (g[0] === 0x2002) {
        const sixToFourV4 = ((g[1]! << 16) | g[2]!) >>> 0;
        if (isForbiddenIpv4Int(sixToFourV4)) return true;
    }

    return false;
}

export function isForbiddenIp(rawIp: string): boolean {
    const stripped = rawIp.trim().replace(/^\[|\]$/g, '');
    const noZone = stripped.split('%')[0] ?? stripped;
    const kind = isIP(noZone);
    if (kind === 4) {
        const n = ipv4ToInt(noZone);
        return n === null || isForbiddenIpv4Int(n);
    }
    if (kind === 6) {
        return isForbiddenIpv6(noZone);
    }
    return true;
}

function normalizeHost(hostname: string): string {
    return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/, '').toLowerCase();
}

export async function assertSafeExternalUrl(rawUrl: string, lookupImpl: DnsLookupAll = defaultLookup): Promise<URL> {
    let parsed: URL;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new SsrfBlockedError('รูปแบบ URL ไม่ถูกต้อง');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new SsrfBlockedError('รองรับเฉพาะโปรโตคอล http:// และ https:// เท่านั้น');
    }
    if (parsed.username || parsed.password) {
        throw new SsrfBlockedError('ไม่อนุญาตให้ใส่ username/password ใน URL');
    }

    const host = normalizeHost(parsed.hostname);
    if (!host) throw new SsrfBlockedError('ไม่พบชื่อโฮสต์ใน URL');
    if (BLOCKED_HOSTNAMES.has(host) || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
        throw new SsrfBlockedError('ไม่อนุญาตให้ตรวจสอบโดเมนภายในหรือ localhost');
    }

    const hostIpKind = isIP(host.split('%')[0] ?? host);
    if (hostIpKind !== 0) {
        if (isForbiddenIp(host)) {
            throw new SsrfBlockedError('ไม่อนุญาตให้ตรวจสอบ IP ภายในหรือเครือข่ายส่วนตัว');
        }
        return parsed;
    }

    let resolved: LookupAddress[];
    try {
        resolved = await lookupImpl(host, { all: true, verbatim: true });
    } catch {
        throw new SsrfBlockedError(`ไม่สามารถค้นหา DNS ของโฮสต์ ${host} ได้`);
    }

    if (!resolved || resolved.length === 0) {
        throw new SsrfBlockedError(`ไม่พบข้อมูล IP ของโฮสต์ ${host}`);
    }
    for (const entry of resolved) {
        if (isForbiddenIp(entry.address)) {
            throw new SsrfBlockedError('ไม่อนุญาตให้ตรวจสอบปลายทางที่ชี้ไปยัง IP ภายในหรือเครือข่ายส่วนตัว');
        }
    }

    return parsed;
}

export async function probeExternalUrl(
    rawUrl: string,
    opts?: { timeoutMs?: number; fetchImpl?: typeof fetch; lookupImpl?: DnsLookupAll },
): Promise<ExternalProbeResult> {
    const timeoutMs = opts?.timeoutMs ?? 10_000;
    const fetchImpl = opts?.fetchImpl ?? fetch;
    const lookupImpl = opts?.lookupImpl ?? defaultLookup;

    let safeUrl: URL;
    try {
        safeUrl = await assertSafeExternalUrl(rawUrl, lookupImpl);
    } catch (err) {
        return {
            status: 'DOWN',
            statusCode: null,
            latencyMs: null,
            error: err instanceof Error ? err.message : String(err),
        };
    }

    const startedAt = Date.now();
    try {
        const res = await fetchImpl(safeUrl.toString(), {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
            headers: {
                'User-Agent': 'NotStack-UptimeMonitor/1.0',
                Accept: '*/*',
            },
        });
        const latencyMs = Math.max(0, Date.now() - startedAt);
        await res.body?.cancel().catch(() => undefined);

        const up = res.status >= 200 && res.status < 400;
        return {
            status: up ? 'UP' : 'DOWN',
            statusCode: res.status,
            latencyMs,
            error: up ? null : `HTTP ${res.status}`,
        };
    } catch (err) {
        const latencyMs = Math.max(0, Date.now() - startedAt);
        const msg = err instanceof Error && err.name === 'TimeoutError' ? `หมดเวลาเชื่อมต่อ (${Math.round(timeoutMs / 1000)} วินาที)` : err instanceof Error ? err.message : String(err);
        return {
            status: 'DOWN',
            statusCode: null,
            latencyMs,
            error: msg.slice(0, 300),
        };
    }
}
