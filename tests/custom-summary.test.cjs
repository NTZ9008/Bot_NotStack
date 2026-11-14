'use strict';

const { after, describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const os = require('node:os');
const path = require('node:path');

const backendRequire = createRequire(path.resolve(__dirname, '../apps/backend/dist/main.js'));
const {
    pairVoiceSessions,
    buildBangkokBuckets,
    bangkokBucketKey,
} = backendRequire('./custom-summary/voice-pairing.util.js');
const { renderCustomSummaryPdf, closePdfBrowser } = backendRequire('./custom-summary/custom-summary-pdf.service.js');
const {
    customSummaryRequestSchema,
    customSummaryPdfRequestSchema,
} = require('../packages/shared/dist/index.js');

const CH_TEXT = '111111111111111111';
const CH_VOICE_A = '222222222222222222';
const CH_VOICE_B = '333333333333333333';
const CH_DEVOPS = '444444444444444444';
const USER_A = '555555555555555555';
const USER_B = '666666666666666666';
const GUILD_ID = '999999999999999999';

describe('customSummary Zod schemas', () => {
    it('validates customSummaryRequestSchema and deduplicates modules', () => {
        const parsed = customSummaryRequestSchema.parse({
            from: '2026-11-10T00:00:00.000Z',
            to: '2026-11-14T00:00:00.000Z',
            channelIds: [CH_VOICE_A, CH_TEXT],
            modules: ['voice', 'messages', 'voice'],
            includeBots: true,
        });

        assert.deepEqual(parsed.modules, ['voice', 'messages']);
        assert.deepEqual(parsed.channelIds, [CH_VOICE_A, CH_TEXT]);
        assert.equal(parsed.includeBots, true);
        assert.equal(parsed.interval, 'auto');
    });

    it('rejects empty modules, malformed channel ids, and inverted date range', () => {
        assert.throws(() =>
            customSummaryRequestSchema.parse({
                modules: [],
            }),
        );

        assert.throws(() =>
            customSummaryRequestSchema.parse({
                channelIds: ['not-a-snowflake'],
            }),
        );

        assert.throws(() =>
            customSummaryRequestSchema.parse({
                from: '2026-11-14T10:00:00.000Z',
                to: '2026-11-14T08:00:00.000Z',
            }),
        );
    });

    it('applies PDF export defaults and validates options', () => {
        const parsed = customSummaryPdfRequestSchema.parse({
            title: 'รายงานสรุปประจำสัปดาห์ ห้องไหลลื่นคลื่นศาลายา',
        });

        assert.equal(parsed.theme, 'dark');
        assert.equal(parsed.detailMode, 'executive');
        assert.throws(() => customSummaryPdfRequestSchema.parse({ title: '   ', theme: 'dark' }));
        assert.throws(() => customSummaryPdfRequestSchema.parse({ title: 'OK', theme: 'sepia' }));
    });
});

describe('pairVoiceSessions engine', () => {
    it('pairs join -> switch -> leave across channels even when filtering single channel', () => {
        const from = Date.parse('2026-11-14T02:00:00.000Z');
        const to = Date.parse('2026-11-14T06:00:00.000Z');
        const events = [
            {
                id: 1,
                eventKey: 'voiceJoin',
                userId: USER_A,
                userName: 'นัท',
                channelId: CH_VOICE_A,
                channelName: 'ไหลลื่นคลื่นศาลายา',
                createdAt: new Date('2026-11-14T03:00:00.000Z'),
            },
            {
                id: 2,
                eventKey: 'voiceSwitch',
                userId: USER_A,
                userName: 'นัท',
                channelId: CH_VOICE_B,
                channelName: "println('ห้องเล่นเกม')",
                createdAt: new Date('2026-11-14T03:25:00.000Z'),
            },
            {
                id: 3,
                eventKey: 'voiceLeave',
                userId: USER_A,
                userName: 'นัท',
                channelId: CH_VOICE_B,
                channelName: "println('ห้องเล่นเกม')",
                createdAt: new Date('2026-11-14T04:10:00.000Z'),
            },
        ];

        const all = pairVoiceSessions(events, { from, to, now: to }, 'hour');
        assert.equal(all.totals.sessions, 2);
        assert.equal(all.totals.totalSeconds, 70 * 60);
        assert.equal(all.byChannel.find((c) => c.channelId === CH_VOICE_A)?.totalSeconds, 25 * 60);
        assert.equal(all.byChannel.find((c) => c.channelId === CH_VOICE_B)?.totalSeconds, 45 * 60);

        // Filtering only Voice A must still stop Voice A session at 03:25 when user switched to Voice B!
        const onlyA = pairVoiceSessions(events, { from, to, now: to, channelIds: [CH_VOICE_A] }, 'hour');
        assert.equal(onlyA.totals.totalSeconds, 25 * 60);
        assert.equal(onlyA.totals.sessions, 1);
    });

    it('handles lookback joins before range start and still-connected users at cutoff', () => {
        const from = Date.parse('2026-11-14T00:00:00.000Z');
        const now = Date.parse('2026-11-14T02:00:00.000Z');
        const to = Date.parse('2026-11-14T04:00:00.000Z'); // future upper bound -> cutoff should clamp to `now`

        const events = [
            {
                id: 10,
                eventKey: 'voiceJoin',
                userId: USER_A,
                userName: 'Alice',
                channelId: CH_VOICE_A,
                channelName: 'ห้องเสียง A',
                createdAt: new Date('2026-11-13T23:30:00.000Z'), // 30m before `from`
            },
            {
                id: 11,
                eventKey: 'voiceLeave',
                userId: USER_A,
                userName: 'Alice',
                channelId: CH_VOICE_A,
                channelName: 'ห้องเสียง A',
                createdAt: new Date('2026-11-14T01:00:00.000Z'),
            },
            {
                id: 12,
                eventKey: 'voiceJoin',
                userId: USER_B,
                userName: 'บอมบ์',
                channelId: CH_VOICE_B,
                channelName: 'ห้องเสียง B',
                createdAt: new Date('2026-11-14T01:15:00.000Z'),
            },
        ];

        const result = pairVoiceSessions(
            events,
            {
                from,
                to,
                now,
                activeVoiceStates: [
                    { userId: USER_B, userName: 'บอมบ์', channelId: CH_VOICE_B, channelName: 'ห้องเสียง B' },
                ],
            },
            'hour',
        );

        assert.equal(result.cutoffMs, now);
        assert.equal(result.totals.activeAtCutoffCount, 1);

        const alice = result.byUser.find((u) => u.userId === USER_A);
        const bob = result.byUser.find((u) => u.userId === USER_B);
        assert.equal(alice?.totalSeconds, 60 * 60); // clipped [00:00, 01:00]
        assert.equal(bob?.totalSeconds, 45 * 60); // [01:15, 02:00] cutoff
        assert.equal(bob?.ongoingAtCutoff, true);
    });

    it('distributes sessions crossing midnight Asia/Bangkok accurately into daily buckets', () => {
        // 23:30 Asia/Bangkok = 16:30Z, 01:30 Asia/Bangkok next day = 18:30Z
        const from = Date.parse('2026-11-13T16:00:00.000Z'); // 23:00 BKK Nov 13
        const to = Date.parse('2026-11-13T20:00:00.000Z'); // 03:00 BKK Nov 14

        const result = pairVoiceSessions(
            [
                {
                    id: 1,
                    eventKey: 'voiceJoin',
                    userId: USER_A,
                    channelId: CH_VOICE_A,
                    createdAt: Date.parse('2026-11-13T16:30:00.000Z'), // 23:30 BKK Nov 13
                },
                {
                    id: 2,
                    eventKey: 'voiceLeave',
                    userId: USER_A,
                    channelId: CH_VOICE_A,
                    createdAt: Date.parse('2026-11-13T18:30:00.000Z'), // 01:30 BKK Nov 14
                },
            ],
            { from, to, now: to },
            'day',
        );

        const day1Key = bangkokBucketKey(Date.parse('2026-11-13T16:30:00.000Z'), 'day');
        const day2Key = bangkokBucketKey(Date.parse('2026-11-13T18:00:00.000Z'), 'day');
        assert.equal(day1Key, '2026-11-13 00:00');
        assert.equal(day2Key, '2026-11-14 00:00');
        assert.equal(result.bucketMs.get(day1Key), 30 * 60_000);
        assert.equal(result.bucketMs.get(day2Key), 90 * 60_000);

        const buckets = buildBangkokBuckets(from, to, 'day');
        assert.deepEqual(buckets, ['2026-11-13 00:00', '2026-11-14 00:00']);
    });
});

function buildSampleSummary(extraRows = 0) {
    const channelBreakdown = [
        {
            channelId: CH_VOICE_A,
            channelName: 'ไหลลื่นคลื่นศาลายา',
            kind: 'voice',
            messages: 0,
            voiceSeconds: 511_320,
            voiceMinutes: 8522,
            voiceJoins: 42,
            voiceLeaves: 40,
            prEvents: 0,
            grafanaAlerts: 0,
            jiraCards: 0,
            otherEvents: 0,
            totalActivity: 82,
        },
        {
            channelId: CH_TEXT,
            channelName: 'peagasus',
            kind: 'text',
            messages: 1284,
            voiceSeconds: 0,
            voiceMinutes: 0,
            voiceJoins: 0,
            voiceLeaves: 0,
            prEvents: 0,
            grafanaAlerts: 0,
            jiraCards: 0,
            otherEvents: 4,
            totalActivity: 1288,
        },
        {
            channelId: CH_DEVOPS,
            channelName: 'github-pr-devops',
            kind: 'devops',
            messages: 19,
            voiceSeconds: 0,
            voiceMinutes: 0,
            voiceJoins: 0,
            voiceLeaves: 0,
            prEvents: 38,
            grafanaAlerts: 5,
            jiraCards: 7,
            otherEvents: 2,
            totalActivity: 71,
        },
    ];

    const detailedLogs = Array.from({ length: 8 + extraRows }, (_, idx) => ({
        id: `log-${idx}`,
        createdAt: new Date(Date.parse('2026-11-14T04:00:00.000Z') - idx * 600_000).toISOString(),
        source: idx % 3 === 0 ? 'pr' : idx % 3 === 1 ? 'grafana' : 'activity',
        eventKey: idx % 3 === 0 ? 'pr_merged' : idx % 3 === 1 ? 'grafana_resolved' : 'voiceJoin',
        eventLabel: idx % 3 === 0 ? 'Merge PR' : idx % 3 === 1 ? 'Grafana ปกติแล้ว' : 'เข้าห้องเสียง',
        userId: USER_A,
        userName: 'ปู่ย่าก้ำกึ่งน้ำใส',
        isBot: false,
        channelId: idx % 3 === 0 ? CH_DEVOPS : CH_VOICE_A,
        channelName: idx % 3 === 0 ? 'github-pr-devops' : 'ไหลลื่นคลื่นศาลายา',
        summary: `ทดสอบสระภาษาไทย น้ำ ก้ำกึ่ง ปู่ย่า รายการที่ ${idx + 1}`,
    }));

    return {
        guild: { id: GUILD_ID, name: 'NotStackOverflow', iconUrl: null },
        range: {
            from: '2026-11-07T00:00:00.000Z',
            to: '2026-11-14T00:00:00.000Z',
            cutoff: '2026-11-14T00:00:00.000Z',
            interval: 'day',
            timeZone: 'Asia/Bangkok',
        },
        filters: {
            channelIds: [],
            selectedChannels: [],
            modules: ['voice', 'messages', 'githubPr', 'devopsOther'],
            userId: null,
            userQuery: null,
            includeBots: false,
        },
        availableChannels: [],
        kpis: {
            voice: {
                totalSeconds: 511_320,
                totalMinutes: 8522,
                joins: 42,
                leaves: 40,
                switches: 9,
                sessions: 42,
                avgSessionMinutes: 203,
                activeAtCutoffCount: 2,
            },
            messages: {
                totalSent: 1303,
                deleted: 12,
                edited: 18,
                busiestChannel: { channelId: CH_TEXT, channelName: 'peagasus', count: 1284 },
            },
            githubPr: {
                totalNotifications: 38,
                openedOrUpdated: 18,
                merged: 16,
                closed: 4,
                mergeRatePercent: 42,
                uniquePrCount: 20,
            },
            devopsOther: {
                grafanaSent: 5,
                grafanaFiring: 2,
                grafanaResolved: 3,
                jiraCreated: 4,
                jiraIssueCreated: 3,
                jiraClosed: 2,
                memberJoin: 6,
                memberLeave: 1,
                netMembers: 5,
                commandsUsed: 94,
            },
            activeUsers: 19,
            totalEvents: 1518,
        },
        timeline: [
            { bucket: '2026-11-07 00:00', label: '07/11', messages: 120, voiceJoins: 4, voiceLeaves: 4, voiceMinutes: 420, prSent: 2, prMerged: 1, prClosed: 0, grafanaAlerts: 1, jiraCards: 1, memberJoin: 1, memberLeave: 0 },
            { bucket: '2026-11-08 00:00', label: '08/11', messages: 210, voiceJoins: 7, voiceLeaves: 6, voiceMinutes: 980, prSent: 4, prMerged: 3, prClosed: 1, grafanaAlerts: 0, jiraCards: 2, memberJoin: 2, memberLeave: 0 },
            { bucket: '2026-11-09 00:00', label: '09/11', messages: 305, voiceJoins: 9, voiceLeaves: 9, voiceMinutes: 1450, prSent: 5, prMerged: 4, prClosed: 1, grafanaAlerts: 2, jiraCards: 1, memberJoin: 0, memberLeave: 1 },
        ],
        voiceChannels: [
            {
                channelId: CH_VOICE_A,
                channelName: 'ไหลลื่นคลื่นศาลายา',
                totalSeconds: 511_320,
                totalMinutes: 8522,
                joins: 42,
                leaves: 40,
                sessions: 42,
                avgSessionMinutes: 203,
                uniqueUsers: 14,
                activeAtCutoffCount: 2,
            },
        ],
        prBreakdown: {
            byRepo: [
                {
                    repoFullName: 'notstack/bot-v4',
                    channelId: CH_DEVOPS,
                    channelName: 'github-pr-devops',
                    sent: 18,
                    merged: 16,
                    closed: 4,
                    total: 38,
                },
            ],
            byChannel: [
                {
                    channelId: CH_DEVOPS,
                    channelName: 'github-pr-devops',
                    sent: 18,
                    merged: 16,
                    closed: 4,
                    total: 38,
                },
            ],
        },
        channelBreakdown,
        topContributors: [
            {
                userId: USER_A,
                userName: 'ปู่ย่าก้ำกึ่งน้ำใส',
                isBot: false,
                voiceSeconds: 280_000,
                voiceMinutes: 4667,
                voiceSessions: 19,
                voiceJoins: 19,
                messages: 642,
                prActivity: 12,
                jiraTickets: 3,
                commandsUsed: 41,
                totalScore: 5900,
                lastSeen: '2026-11-14T04:00:00.000Z',
            },
        ],
        detailedLogs,
        detailedLogsTruncated: false,
        generatedAt: '2026-11-14T04:30:00.000Z',
    };
}

describe('renderCustomSummaryPdf (Chromium formal Thai business report)', () => {
    after(async () => {
        await closePdfBrowser();
    });

    it('renders formal A4 business report PDF with valid embedded Thai fonts and unmasked IDs by default', async () => {
        const sample = buildSampleSummary(0);
        const buf = await renderCustomSummaryPdf(sample, {
            title: 'รายงานสรุปกิจกรรมเซิร์ฟเวอร์ NotStackOverflow น้ำไหลลื่นคลื่นศาลายา',
            theme: 'dark',
            detailMode: 'executive',
            adminName: 'Admin ทดสอบ',
        });

        assert.ok(Buffer.isBuffer(buf));
        assert.ok(buf.length > 20_000, `expected embedded font PDF size > 20KB, got ${buf.length}`);
        const raw = buf.toString('latin1');
        assert.match(raw.slice(0, 12), /^%PDF-1\.\d/);
        assert.match(raw, /\/ToUnicode/);
    });

    it('renders multi-page detailed report, strips emojis/markdown links, renames PR label, supports maskIds, and preserves Thai shaping in pdftotext', async () => {
        const execBuf = await renderCustomSummaryPdf(buildSampleSummary(0), {
            title: 'รายงานสรุปกิจกรรมเซิร์ฟเวอร์ NotStackOverflow',
            theme: 'light',
            detailMode: 'executive',
            adminName: 'Admin',
        });

        const sample = buildSampleSummary(55);
        sample.channelBreakdown = [
            {
                ...sample.channelBreakdown[0],
                channelName: '🟢💬พูดคุย-ทั่วไป',
            },
            ...sample.channelBreakdown.slice(1),
        ];
        sample.detailedLogs = [
            {
                id: 'log-pr-open',
                createdAt: '2026-11-14T04:10:00.000Z',
                source: 'pr',
                eventKey: 'pr_opened',
                eventLabel: 'PR แจ้งเตือน',
                userId: USER_A,
                userName: 'ปู่ย่าก้ำกึ่งน้ำใส',
                isBot: false,
                channelId: CH_DEVOPS,
                channelName: '🚀github-pr-devops',
                summary: 'เปิด [PR #42 ปรับปรุงระบบอื่นๆ และข้อความ](https://github.com/notstack/bot-v4/pull/42) ใน repo',
            },
            ...sample.detailedLogs,
        ];

        const detailedUnmasked = await renderCustomSummaryPdf(sample, {
            title: 'รายงานสรุปกิจกรรมเซิร์ฟเวอร์ NotStackOverflow',
            theme: 'light',
            detailMode: 'detailed',
            adminName: 'Admin ทดสอบ',
        });

        const detailedMasked = await renderCustomSummaryPdf(sample, {
            title: 'รายงานสรุปกิจกรรมเซิร์ฟเวอร์ NotStackOverflow',
            theme: 'light',
            detailMode: 'detailed',
            adminName: 'Admin ทดสอบ',
            maskIds: true,
        });

        const raw = detailedUnmasked.toString('latin1');
        assert.match(raw.slice(0, 12), /^%PDF-1\.\d/);
        assert.ok(detailedUnmasked.length > execBuf.length, 'detailed multi-page PDF should contain additional pages/content');
        const pageCount = (raw.match(/\/Type\s*\/Page\b/g) || []).length;
        assert.ok(pageCount >= 2, `expected multi-page PDF (>= 2 pages), got ${pageCount}`);

        // ทดสอบการดึงข้อความภาษาไทยจริงด้วย pdftotext (หากติดตั้งอยู่ในระบบ)
        let pdftotextBin = 'pdftotext';
        if (process.platform === 'win32' && fs.existsSync('C:/Program Files/Git/mingw64/bin/pdftotext.exe')) {
            pdftotextBin = 'C:/Program Files/Git/mingw64/bin/pdftotext.exe';
        }
        try {
            const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notstack-pdf-test-'));
            const unmaskedPath = path.join(tmpDir, 'unmasked.pdf');
            const maskedPath = path.join(tmpDir, 'masked.pdf');
            fs.writeFileSync(unmaskedPath, detailedUnmasked);
            fs.writeFileSync(maskedPath, detailedMasked);

            const extracted = execFileSync(pdftotextBin, ['-enc', 'UTF-8', '-layout', unmaskedPath, '-'], {
                encoding: 'utf8',
            });
            const extractedMasked = execFileSync(pdftotextBin, ['-enc', 'UTF-8', '-layout', maskedPath, '-'], {
                encoding: 'utf8',
            });

            fs.rmSync(tmpDir, { recursive: true, force: true });

            for (const word of ['ข้อความ', 'เปิด', 'ปิด', 'อื่นๆ', 'ที่เลือก']) {
                assert.ok(extracted.includes(word), `expected clean Thai word "${word}" in extracted PDF text`);
            }
            assert.ok(!extracted.includes('PR แจ้งเตือน'), 'expected "PR แจ้งเตือน" to be renamed to "เปิด PR"');
            assert.ok(extracted.includes('เปิด PR'), 'expected "เปิด PR" in extracted PDF text');
            assert.ok(extracted.includes('PR #42 ปรับปรุงระบบอื่นๆ และข้อความ'), 'expected markdown link label kept as plain text');
            assert.ok(!extracted.includes('https://github.com/notstack/bot-v4/pull/42'), 'expected markdown link URL dropped');
            assert.ok(extracted.includes('#พูดคุย-ทั่วไป'), 'expected channel emoji stripped in PDF');
            assert.ok(!extracted.includes('🟢'), 'expected emoji stripped from channel name');

            assert.ok(extracted.includes(GUILD_ID), 'expected Server ID visible when maskIds is false');
            assert.ok(!extractedMasked.includes(GUILD_ID), 'expected Server ID hidden when maskIds is true');
            assert.ok(!extractedMasked.includes(USER_A), 'expected User ID hidden when maskIds is true');
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return; // ข้ามเฉพาะกรณีเครื่องไม่มีไบนารี pdftotext
            }
            throw err;
        }
    });
});
