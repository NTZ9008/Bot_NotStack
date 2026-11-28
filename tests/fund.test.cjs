const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../apps/backend/node_modules/reflect-metadata');
const { loadImage } = require('../apps/backend/node_modules/@napi-rs/canvas');
const {
    createFundTopicSchema,
    updateFundTopicSchema,
    addFundMembersSchema,
    updateFundMemberSchema,
    createFundPaymentSchema,
    batchFundPaymentSchema,
    sendFundReportSchema,
    FUND_REPORT_THEMES,
    DEFAULT_FUND_REPORT_THEME,
    FUND_REPORT_THEME_PALETTES,
    fundReportThemeSchema,
    isFundReportTheme,
    resolveFundReportTheme,
    buildFundReportCardData,
    roundMoney,
    formatBaht,
    fundMemberStatus,
    calculateDays,
    calculateDailyAmount,
    generateFundCsv,
    fundCsvFilename,
    defaultAvatarUrl,
} = require('../packages/shared/dist');
const { buildFundReport, progressBar } = require('../apps/backend/dist/fund/utils/fund-report');
const { renderFundReportCard } = require('../apps/backend/dist/fund/utils/fund-report-card.renderer');
const { planPaidAdjustment } = require('../apps/backend/dist/fund/utils/paid-adjustment');
const { FundController } = require('../apps/backend/dist/fund/fund.controller');
const { FundService } = require('../apps/backend/dist/fund/fund.service');

test('roundMoney and formatBaht format currency correctly', () => {
    assert.equal(roundMoney(100.456), 100.46);
    assert.equal(roundMoney(0), 0);
    assert.equal(roundMoney(null), 0);
    assert.equal(formatBaht(500), '500 บาท');
    assert.equal(formatBaht(1250.5), '1,250.5 บาท');
});

test('fundMemberStatus classifies paid, partial and unpaid correctly', () => {
    assert.equal(fundMemberStatus(500, 0), 'unpaid');
    assert.equal(fundMemberStatus(500, 200), 'partial');
    assert.equal(fundMemberStatus(500, 500), 'paid');
    assert.equal(fundMemberStatus(500, 600), 'paid');
    assert.equal(fundMemberStatus(0, 0), 'paid');
});

test('createFundTopicSchema validates topic creation', () => {
    const valid = createFundTopicSchema.parse({
        name: '  ค่าหมูกระทะ  ',
        description: 'โอนเข้า พร้อมเพย์ 0812345678',
        amountPerMember: 350,
        reportChannelId: '123456789012345678',
        dueDate: '2026-12-31T23:59:00.000Z',
    });
    assert.equal(valid.name, 'ค่าหมูกระทะ');
    assert.equal(valid.amountPerMember, 350);
    assert.equal(valid.reportChannelId, '123456789012345678');
    assert.equal(typeof valid.dueDate, 'string');

    // Missing name fails
    assert.equal(createFundTopicSchema.safeParse({ name: '   ', amountPerMember: 100 }).success, false);
    // Negative amount fails
    assert.equal(createFundTopicSchema.safeParse({ name: 'test', amountPerMember: -50 }).success, false);
    // Invalid report channel ID fails
    assert.equal(createFundTopicSchema.safeParse({ name: 'test', amountPerMember: 100, reportChannelId: 'bad_id' }).success, false);
});

test('updateFundTopicSchema allows partial updates', () => {
    const valid = updateFundTopicSchema.parse({ closed: true });
    assert.equal(valid.closed, true);
    assert.equal(valid.name, undefined);

    const updateAmount = updateFundTopicSchema.parse({ amountPerMember: 500 });
    assert.equal(updateAmount.amountPerMember, 500);
});

test('addFundMembersSchema requires userIds or roleId', () => {
    // Fails when empty
    assert.equal(addFundMembersSchema.safeParse({}).success, false);

    // Valid with userIds
    const withUsers = addFundMembersSchema.parse({
        userIds: ['123456789012345678', '987654321098765432'],
        targetAmount: 200,
    });
    assert.equal(withUsers.userIds.length, 2);
    assert.equal(withUsers.targetAmount, 200);

    // Valid with roleId
    const withRole = addFundMembersSchema.parse({ roleId: '123456789012345678' });
    assert.equal(withRole.roleId, '123456789012345678');
});

test('updateFundMemberSchema supports custom target or reset to null', () => {
    assert.equal(updateFundMemberSchema.parse({ targetAmount: 300 }).targetAmount, 300);
    assert.equal(updateFundMemberSchema.parse({ targetAmount: null }).targetAmount, null);
    assert.equal(updateFundMemberSchema.safeParse({ targetAmount: -10 }).success, false);
});

test('createFundPaymentSchema validates payment recordings', () => {
    const valid = createFundPaymentSchema.parse({
        memberId: 5,
        amount: 350.5,
        note: 'โอนแล้ว',
    });
    assert.equal(valid.memberId, 5);
    assert.equal(valid.amount, 350.5);
    assert.equal(valid.note, 'โอนแล้ว');

    // Amount <= 0 fails
    assert.equal(createFundPaymentSchema.safeParse({ memberId: 1, amount: 0 }).success, false);
    assert.equal(createFundPaymentSchema.safeParse({ memberId: 1, amount: -100 }).success, false);
    // Invalid memberId fails
    assert.equal(createFundPaymentSchema.safeParse({ memberId: 0, amount: 100 }).success, false);
});

test('sendFundReportSchema validates report options', () => {
    const valid = sendFundReportSchema.parse({ mentionUnpaid: true, channelId: '123456789012345678' });
    assert.equal(valid.mentionUnpaid, true);
    assert.equal(valid.channelId, '123456789012345678');

    // Empty object is valid (uses defaults)
    assert.deepEqual(sendFundReportSchema.parse({}), {});
});

test('progressBar generates visual bar', () => {
    assert.equal(progressBar(0, 10), '░░░░░░░░░░ 0%');
    assert.equal(progressBar(0.5, 10), '█████░░░░░ 50%');
    assert.equal(progressBar(1, 10), '██████████ 100%');
});

test('buildFundReport produces valid embed payload with summary and members', () => {
    const topic = {
        id: 1,
        name: 'ค่าเซิร์ฟเวอร์ Minecraft',
        description: 'หารกัน 3 คน',
        amountPerMember: 150,
        reportChannelId: '123456789012345678',
        dueDate: '2026-12-31T23:59:00.000Z',
        closed: false,
        memberCount: 3,
        paidCount: 1,
        target: 450,
        collected: 250,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        members: [
            { id: 1, userId: '111111111111111111', displayName: 'Alice', avatar: '', target: 150, customTarget: false, paid: 150, remaining: 0, status: 'paid' },
            { id: 2, userId: '222222222222222222', displayName: 'Bob', avatar: '', target: 150, customTarget: false, paid: 100, remaining: 50, status: 'partial' },
            { id: 3, userId: '333333333333333333', displayName: 'Charlie', avatar: '', target: 150, customTarget: false, paid: 0, remaining: 150, status: 'unpaid' },
        ],
        payments: [],
    };

    const reportWithoutMention = buildFundReport(topic, { mentionUnpaid: false });
    assert.ok(reportWithoutMention.embeds.length >= 2);
    assert.equal(reportWithoutMention.content, undefined);

    const reportWithMention = buildFundReport(topic, { mentionUnpaid: true });
    assert.ok(reportWithMention.embeds.length >= 2);
    assert.ok(reportWithMention.content.includes('<@222222222222222222>'));
    assert.ok(reportWithMention.content.includes('<@333333333333333333>'));
    // Paid member Alice shouldn't be mentioned
    assert.ok(!reportWithMention.content.includes('<@111111111111111111>'));
    assert.deepEqual(reportWithMention.allowedMentions.users, ['333333333333333333', '222222222222222222']);
});

test('renderFundReportCard produces valid PNG buffer for full and compact modes', async () => {
    const topic = {
        id: 1,
        name: 'เงินทุนกองกลาง',
        description: 'พร้อมเพย์ 081-234-5678',
        amountPerMember: 15,
        dailyRate: 15,
        startDate: '2026-10-01T00:00:00.000Z',
        reportChannelId: '123456789012345678',
        dueDate: '2026-10-31T23:59:00.000Z',
        closed: false,
        memberCount: 2,
        paidCount: 1,
        target: 465,
        collected: 240,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        members: [
            { id: 1, userId: '111111111111111111', displayName: 'Alice', avatar: '', target: 225, customTarget: false, paid: 225, remaining: 0, status: 'paid' },
            { id: 2, userId: '222222222222222222', displayName: 'Bob', avatar: '', target: 240, customTarget: false, paid: 15, remaining: 225, status: 'partial' },
        ],
        payments: [],
    };

    const pngFull = await renderFundReportCard(topic, false);
    assert.ok(Buffer.isBuffer(pngFull));
    assert.ok(pngFull.length > 1000);
    // PNG magic bytes: 89 50 4E 47
    assert.deepEqual(pngFull.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const pngCompact = await renderFundReportCard(topic, true);
    assert.ok(Buffer.isBuffer(pngCompact));
    // Compact mode encodes WebP (RIFF header: 52 49 46 46)
    assert.deepEqual(pngCompact.subarray(0, 4), Buffer.from('RIFF'));
});

test('calculateDays and calculateDailyAmount calculate correct days and baht', () => {
    // Same day inclusive = 1 day
    assert.equal(calculateDays('2026-10-01', '2026-10-01'), 1);
    // 1 to 15 October = 15 days
    assert.equal(calculateDays('2026-10-01', '2026-10-15'), 15);
    // End before start = 0
    assert.equal(calculateDays('2026-10-15', '2026-10-01'), 0);
    // Invalid input = 0
    assert.equal(calculateDays(null, '2026-10-01'), 0);
    assert.equal(calculateDays('invalid', '2026-10-01'), 0);

    // 15 baht per day for 15 days = 225 baht
    assert.equal(calculateDailyAmount(15, '2026-10-01', '2026-10-15'), 225);
    // 15 baht per day for 1 day = 15 baht
    assert.equal(calculateDailyAmount(15, '2026-10-01', '2026-10-01'), 15);
    // Float daily rate: 12.50 baht for 4 days = 50 baht
    assert.equal(calculateDailyAmount(12.5, '2026-10-01', '2026-10-04'), 50);
});

test('createFundTopicSchema supports dailyRate and startDate', () => {
    const dailyTopic = createFundTopicSchema.parse({
        name: 'กองกลางรายวัน 15 บาท',
        amountPerMember: 450,
        dailyRate: 15,
        startDate: '2026-10-01T00:00:00.000Z',
    });
    assert.equal(dailyTopic.name, 'กองกลางรายวัน 15 บาท');
    assert.equal(dailyTopic.dailyRate, 15);
    assert.equal(typeof dailyTopic.startDate, 'string');
});

test('createFundPaymentSchema supports periodStart and periodEnd', () => {
    const payment = createFundPaymentSchema.parse({
        memberId: 1,
        amount: 225,
        note: 'งวดวันที่ 01/10 ถึง 15/10',
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-15T23:59:59.000Z',
    });
    assert.equal(payment.memberId, 1);
    assert.equal(payment.amount, 225);
    assert.equal(payment.note, 'งวดวันที่ 01/10 ถึง 15/10');
    assert.equal(typeof payment.periodStart, 'string');
    assert.equal(typeof payment.periodEnd, 'string');
});

test('batchFundPaymentSchema validates batch payments for multiple members', () => {
    const batch = batchFundPaymentSchema.parse({
        memberIds: [1, 2, 3],
        amount: 150,
        note: 'งวดวันที่ 01/10 ถึง 10/10 (10 วัน)',
        periodStart: '2026-10-01T00:00:00.000Z',
        periodEnd: '2026-10-10T23:59:59.000Z',
    });
    assert.deepEqual(batch.memberIds, [1, 2, 3]);
    assert.equal(batch.amount, 150);

    // Empty memberIds fails
    assert.equal(batchFundPaymentSchema.safeParse({ memberIds: [], amount: 100 }).success, false);
    // Non-positive amount fails
    assert.equal(batchFundPaymentSchema.safeParse({ memberIds: [1], amount: 0 }).success, false);
});

test('generateFundCsv generates valid UTF-8 BOM CSV with summary, members and payment periods', () => {
    const topic = {
        id: 1,
        name: 'กองกลางรายวัน',
        description: 'เก็บวันละ 15 บาท',
        amountPerMember: 450,
        dailyRate: 15,
        startDate: '2026-10-01T00:00:00.000Z',
        reportChannelId: '',
        dueDate: '2026-10-31T23:59:00.000Z',
        closed: false,
        memberCount: 2,
        paidCount: 1,
        target: 900,
        collected: 675,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-15T12:00:00.000Z',
        members: [
            { id: 1, userId: '111', displayName: 'Alice, In Wonderland', avatar: '', target: 450, customTarget: false, paid: 450, remaining: 0, status: 'paid' },
            { id: 2, userId: '222', displayName: 'Bob', avatar: '', target: 450, customTarget: false, paid: 225, remaining: 225, status: 'partial' },
        ],
        payments: [
            {
                id: 1,
                memberId: 1,
                memberName: 'Alice, In Wonderland',
                amount: 450,
                note: 'จ่ายครบทั้งเดือน',
                paidAt: '2026-10-05T10:00:00.000Z',
                periodStart: '2026-10-01T00:00:00.000Z',
                periodEnd: '2026-10-30T23:59:00.000Z',
                recordedBy: 'Admin',
            },
        ],
    };

    const csv = generateFundCsv(topic);
    // Starts with UTF-8 BOM
    assert.ok(csv.startsWith('\uFEFF'));
    // Contains header info
    assert.ok(csv.includes('หัวข้อการเก็บเงิน,กองกลางรายวัน'));
    assert.ok(csv.includes('รายวัน (วันละ 15 บาท)'));
    // Escaped comma in Alice's name
    assert.ok(csv.includes('"Alice, In Wonderland"'));
    // Contains payment period
    assert.ok(csv.includes('จ่ายครบทั้งเดือน'));
});

test('buildFundReport includes daily rate field when dailyRate is set', () => {
    const topic = {
        id: 1,
        name: 'กองกลางรายวัน',
        description: '',
        amountPerMember: 450,
        dailyRate: 15,
        startDate: '2026-10-01T00:00:00.000Z',
        reportChannelId: '',
        dueDate: null,
        closed: false,
        memberCount: 1,
        paidCount: 1,
        target: 450,
        collected: 450,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        members: [{ id: 1, userId: '111', displayName: 'Alice', avatar: '', target: 450, customTarget: false, paid: 450, remaining: 0, status: 'paid' }],
        payments: [],
    };

    const report = buildFundReport(topic, { mentionUnpaid: false });
    const summaryEmbed = report.embeds[0];
    const dailyField = summaryEmbed.data.fields.find((f) => f.name === '📅 ยอดรายวัน');
    assert.ok(dailyField);
    assert.ok(dailyField.value.includes('15 บาท/วัน'));
});

test('planPaidAdjustment edits as few payments as possible to reach the new paid total', () => {
    const none = { deleteIds: [], updates: [], create: null };
    // ยอดใหม่ ≤ 0 → ลบทุกรายการ
    assert.deepEqual(planPaidAdjustment([{ id: 1, amount: 50 }, { id: 2, amount: 20 }], 0), { ...none, deleteIds: [1, 2] });
    // ยังไม่มีรายการ → สร้างใหม่
    assert.deepEqual(planPaidAdjustment([], 120.456), { ...none, create: 120.46 });
    // มีรายการเดียว → แก้ยอดรายการนั้น (แม้ยอดเท่าเดิมก็อัปเดตผู้บันทึก)
    assert.deepEqual(planPaidAdjustment([{ id: 7, amount: 30 }], 45), { ...none, updates: [{ id: 7, amount: 45 }] });
    // ยอดเพิ่มขึ้น → บวกส่วนต่างเข้ารายการล่าสุด (ตัวแรก)
    assert.deepEqual(planPaidAdjustment([{ id: 3, amount: 10 }, { id: 2, amount: 20 }], 50), { ...none, updates: [{ id: 3, amount: 30 }] });
    // ยอดเท่าเดิม (หลายรายการ) → ไม่ต้องแก้อะไร
    assert.deepEqual(planPaidAdjustment([{ id: 3, amount: 10 }, { id: 2, amount: 20 }], 30), none);
    // ยอดลดลง → หักจากรายการล่าสุด ลบรายการที่หักหมด แล้วแก้รายการถัดไป
    assert.deepEqual(planPaidAdjustment([{ id: 3, amount: 10 }, { id: 2, amount: 20 }, { id: 1, amount: 30 }], 35), {
        ...none,
        deleteIds: [3],
        updates: [{ id: 2, amount: 5 }],
    });
    // หักพอดีรายการ → ลบรายการนั้นอย่างเดียว
    assert.deepEqual(planPaidAdjustment([{ id: 3, amount: 10 }, { id: 2, amount: 20 }], 20), { ...none, deleteIds: [3] });
});

test('fundCsvFilename and defaultAvatarUrl are shared by the dashboard and API', () => {
    assert.equal(fundCsvFilename('ค่าห้อง: ตุลา/2569', new Date('2026-10-21T12:00:00Z')), 'fund-ค่าห้อง_ ตุลา_2569-2026-10-21.csv');
    assert.equal(fundCsvFilename('', new Date('2026-01-02T00:00:00Z')), 'fund-fund-2026-01-02.csv');
    assert.equal(defaultAvatarUrl('123456789012345678'), `https://cdn.discordapp.com/embed/avatars/${Number(123456789012345678n % 5n)}.png`);
    assert.equal(defaultAvatarUrl('not-an-id'), 'https://cdn.discordapp.com/embed/avatars/0.png');
});

function makeReportTopic(overrides = {}) {
    return {
        id: 10,
        name: 'เที่ยวหัวหิน/ชะอำ',
        description: 'พร้อมเพย์ 081-234-5678\nโอนแล้วแจ้งสลิปได้เลย',
        amountPerMember: 900,
        dailyRate: null,
        startDate: null,
        reportChannelId: '123456789012345678',
        dueDate: '2026-12-10T16:59:00.000Z',
        closed: false,
        memberCount: 4,
        paidCount: 1,
        target: 3600,
        collected: 1650,
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-28T02:00:00.000Z',
        members: [
            { id: 1, userId: '111111111111111111', displayName: 'ธนากร ชื่อยาวมากทดสอบภาษาไทย', avatar: '', target: 900, customTarget: false, paid: 0, remaining: 900, status: 'unpaid' },
            { id: 2, userId: '222222222222222222', displayName: 'Nattapong ✨', avatar: '', target: 900, customTarget: false, paid: 450, remaining: 450, status: 'partial' },
            { id: 3, userId: '333333333333333333', displayName: 'ปิยะนุช ใจดี', avatar: '', target: 900, customTarget: false, paid: 300, remaining: 600, status: 'partial' },
            { id: 4, userId: '444444444444444444', displayName: 'Alice', avatar: '', target: 900, customTarget: false, paid: 900, remaining: 0, status: 'paid' },
        ],
        payments: [],
        ...overrides,
    };
}

test('report theme registry keeps default and exposes 4 new distinct palettes including seasonal Christmas Wonderland', () => {
    assert.deepEqual(FUND_REPORT_THEMES, ['default', 'minimal-finance', 'arcade-quest', 'cozy-journey', 'christmas-wonderland']);
    assert.equal(DEFAULT_FUND_REPORT_THEME, 'default');

    assert.equal(FUND_REPORT_THEME_PALETTES['minimal-finance'].background, '#F8F6F0');
    assert.equal(FUND_REPORT_THEME_PALETTES['minimal-finance'].primary, '#059669');
    assert.equal(FUND_REPORT_THEME_PALETTES['arcade-quest'].background, '#17132E');
    assert.equal(FUND_REPORT_THEME_PALETTES['arcade-quest'].primary, '#22D3EE');
    assert.equal(FUND_REPORT_THEME_PALETTES['cozy-journey'].background, '#FFF8EA');
    assert.equal(FUND_REPORT_THEME_PALETTES['cozy-journey'].primary, '#8BAF91');
    assert.equal(FUND_REPORT_THEME_PALETTES['christmas-wonderland'].background, '#0B2925');
    assert.equal(FUND_REPORT_THEME_PALETTES['christmas-wonderland'].surface, '#123C32');
    assert.equal(FUND_REPORT_THEME_PALETTES['christmas-wonderland'].primary, '#E7C779');
    assert.equal(FUND_REPORT_THEME_PALETTES['christmas-wonderland'].secondary, '#C94145');

    assert.equal(resolveFundReportTheme(undefined), 'default');
    assert.equal(resolveFundReportTheme(null), 'default');
    assert.equal(resolveFundReportTheme(''), 'default');
    assert.equal(resolveFundReportTheme('arcade-quest'), 'arcade-quest');
    assert.throws(() => resolveFundReportTheme('not-a-theme'));

    assert.equal(isFundReportTheme('cozy-journey'), true);
    assert.equal(isFundReportTheme('nope'), false);
    assert.equal(isFundReportTheme(123), false);

    assert.equal(fundReportThemeSchema.parse('minimal-finance'), 'minimal-finance');
    assert.equal(sendFundReportSchema.parse({ theme: 'cozy-journey', mentionUnpaid: true }).theme, 'cozy-journey');
    assert.equal(sendFundReportSchema.safeParse({ theme: 'unknown' }).success, false);
});

test('buildFundReportCardData computes unified financial metrics, due states, and member groupings', () => {
    const now = new Date('2026-11-28T03:00:00.000Z');
    const data = buildFundReportCardData(makeReportTopic(), now);

    assert.equal(data.title, 'เที่ยวหัวหิน/ชะอำ');
    assert.equal(data.description, 'พร้อมเพย์ 081-234-5678');
    assert.equal(data.target, 3600);
    assert.equal(data.collected, 1650);
    assert.equal(data.remaining, 1950);
    assert.equal(data.progressPct, 46);
    assert.equal(data.progressTier, 'medium');
    assert.equal(data.paidCount, 1);
    assert.equal(data.memberCount, 4);
    assert.equal(data.unpaidCount, 1);
    assert.equal(data.partialCount, 2);
    assert.equal(data.outstandingMemberCount, 3);
    assert.equal(data.rateLabel, '900 บาท/คน');
    assert.equal(data.due.remainingDaysLabel, 'อีก 12 วัน');
    assert.equal(data.groups.unpaid.length, 1);
    assert.equal(data.groups.partial.length, 2);
    assert.equal(data.groups.paid.length, 1);
    assert.equal(data.groups.partial[0].displayName, 'ปิยะนุช ใจดี');

    const low = buildFundReportCardData(
        makeReportTopic({
            collected: 200,
            paidCount: 0,
            dueDate: '2026-11-28T10:00:00.000Z',
            dailyRate: 25,
        }),
        now,
    );
    assert.equal(low.progressTier, 'low');
    assert.equal(low.due.remainingDaysLabel, 'ครบกำหนดวันนี้');
    assert.equal(low.due.tone, 'partial');
    assert.equal(low.rateLabel, '25 บาท/วัน');

    const overdue = buildFundReportCardData(
        makeReportTopic({
            dueDate: '2026-11-25T10:00:00.000Z',
        }),
        now,
    );
    assert.equal(overdue.due.remainingDaysLabel, 'เลยกำหนด 3 วัน');
    assert.equal(overdue.due.tone, 'unpaid');

    const complete = buildFundReportCardData(
        makeReportTopic({
            collected: 3600,
            paidCount: 4,
            dueDate: null,
            members: makeReportTopic().members.map((m) => ({ ...m, paid: 900, remaining: 0, status: 'paid' })),
        }),
        now,
    );
    assert.equal(complete.progressTier, 'complete');
    assert.equal(complete.isCompleted, true);
    assert.equal(complete.statusLabel, 'เก็บครบแล้ว');
    assert.equal(complete.due.dateLabel, 'ไม่กำหนด');

    const closed = buildFundReportCardData(makeReportTopic({ closed: true, target: 0, collected: 0, memberCount: 0, paidCount: 0, members: [] }), now);
    assert.equal(closed.statusLabel, 'ปิดการเก็บแล้ว');
    assert.equal(closed.due.tone, 'closed');
    assert.equal(closed.progressPct, 0);
});

test('renderFundReportCard renders distinct valid PNG and WebP buffers across all 4 themes and progress states', async () => {
    const buffers = new Map();
    const baseTopic = makeReportTopic();

    for (const theme of FUND_REPORT_THEMES) {
        const png = await renderFundReportCard(baseTopic, false, theme);
        assert.deepEqual(png.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const img = await loadImage(png);
        assert.ok(img.width >= 960);
        assert.ok(img.height > 400);
        buffers.set(theme, png);

        const webp = await renderFundReportCard(baseTopic, true, theme);
        assert.deepEqual(webp.subarray(0, 4), Buffer.from('RIFF'));

        // Empty member list + closed state
        const emptyPng = await renderFundReportCard(
            makeReportTopic({ closed: true, members: [], memberCount: 0, paidCount: 0, target: 0, collected: 0 }),
            false,
            theme,
        );
        assert.deepEqual(emptyPng.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }

    // All 5 themes produce distinct visual outputs
    const uniqueHashes = new Set([...buffers.values()].map((b) => b.toString('base64').slice(0, 120) + ':' + b.length));
    assert.equal(uniqueHashes.size, 5);

    // Exercise all 4 Christmas Wonderland mascot stages (0-30%, 31-60%, 61-99%, 100%)
    for (const collectedAmt of [500, 1800, 2900, 3600]) {
        const isDone = collectedAmt === 3600;
        const xmasPng = await renderFundReportCard(
            makeReportTopic({
                collected: collectedAmt,
                paidCount: isDone ? 4 : 1,
                members: isDone ? baseTopic.members.map((m) => ({ ...m, paid: 900, remaining: 0, status: 'paid' })) : baseTopic.members,
            }),
            false,
            'christmas-wonderland',
        );
        assert.deepEqual(xmasPng.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }

    // Exercise low and complete progress states (all mascot poses & completed flags)
    for (const theme of FUND_REPORT_THEMES) {
        const lowPng = await renderFundReportCard(
            makeReportTopic({
                collected: 300,
                paidCount: 0,
                dailyRate: 15,
                dueDate: '2026-11-29T23:59:00.000Z',
            }),
            false,
            theme,
        );
        assert.deepEqual(lowPng.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

        const completePng = await renderFundReportCard(
            makeReportTopic({
                collected: 3600,
                paidCount: 4,
                members: baseTopic.members.map((m) => ({ ...m, paid: 900, remaining: 0, status: 'paid' })),
            }),
            false,
            theme,
        );
        assert.deepEqual(completePng.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }
});

test('renderFundReportCard supports long member lists in multi-column layouts without clipping', async () => {
    const statuses = ['unpaid', 'partial', 'paid'];
    const members = Array.from({ length: 28 }, (_, idx) => {
        const status = statuses[idx % 3];
        const target = 1000;
        const paid = status === 'paid' ? 1000 : status === 'partial' ? 450 : 0;
        return {
            id: idx + 1,
            userId: String(100000000000000000n + BigInt(idx)),
            displayName: `สมาชิกคนที่ ${idx + 1} ชื่อยาวมากทดสอบการตัดคำภาษาไทย`,
            avatar: '',
            target,
            customTarget: false,
            paid,
            remaining: target - paid,
            status,
        };
    });
    const longTopic = makeReportTopic({
        name: 'ทริปเที่ยวหัวหินชะอำประจำปีของกลุ่มเพื่อนสมาชิกทุกคนในเซิร์ฟเวอร์ดิสคอร์ดยาวมากๆ เพื่อทดสอบการย่อขนาดตัวอักษร',
        memberCount: members.length,
        paidCount: members.filter((m) => m.status === 'paid').length,
        target: members.reduce((s, m) => s + m.target, 0),
        collected: members.reduce((s, m) => s + m.paid, 0),
        members,
    });

    for (const theme of FUND_REPORT_THEMES) {
        const png = await renderFundReportCard(longTopic, false, theme);
        assert.deepEqual(png.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
        const img = await loadImage(png);
        assert.ok(img.height > 800);
    }
});

test('FundController.reportImage and FundService.sendReport pass selected theme and reject invalid theme', async () => {
    const calls = [];
    const controller = new FundController({
        renderReportImage: async (guildId, topicId, compact, theme) => {
            calls.push({ guildId, topicId, compact, theme });
            return Buffer.from('png-bytes');
        },
    });
    const fakeRes = () => ({
        headers: {},
        setHeader(k, v) {
            this.headers[k] = v;
        },
        send(buf) {
            this.body = buf;
        },
    });

    const resDefault = fakeRes();
    await controller.reportImage('g1', '42', undefined, resDefault);
    assert.equal(calls[0].theme, 'default');
    assert.equal(resDefault.headers['Content-Type'], 'image/png');

    const resArcade = fakeRes();
    await controller.reportImage('g1', '42', 'arcade-quest', resArcade);
    assert.equal(calls[1].theme, 'arcade-quest');

    const resXmas = fakeRes();
    await controller.reportImage('g1', '42', 'christmas-wonderland', resXmas);
    assert.equal(calls[2].theme, 'christmas-wonderland');

    await assert.rejects(() => controller.reportImage('g1', '42', 'invalid-theme', fakeRes()), /ไม่พบธีมการ์ดรายงาน/);

    // Verify FundService.sendReport sends PNG attachment with selected theme & preserves unpaid mentions
    const sentPayloads = [];
    const topicRow = {
        id: 7,
        guildId: 'g1',
        name: 'ทริปทะเล',
        description: '',
        amountPerMember: { toNumber: () => 500 },
        dailyRate: null,
        startDate: null,
        reportChannelId: '123456789012345678',
        dueDate: null,
        closed: false,
        createdAt: new Date('2026-11-20T00:00:00Z'),
        updatedAt: new Date('2026-11-28T00:00:00Z'),
        members: [
            { id: 1, userId: '111111111111111111', displayName: 'Alice', targetAmount: null },
            { id: 2, userId: '222222222222222222', displayName: 'Bob', targetAmount: null },
        ],
        payments: [{ id: 1, memberId: 1, amount: { toNumber: () => 500 }, note: '', paidAt: new Date(), periodStart: null, periodEnd: null, recordedBy: 'Admin' }],
    };
    const fakeChannel = {
        name: 'finance',
        isSendable: () => true,
        send: async (msg) => {
            sentPayloads.push(msg);
        },
    };
    const service = new FundService(
        { fundTopic: { findFirst: async () => topicRow } },
        {
            requireReady() {},
            fetchGuildChannel: async () => fakeChannel,
            guild: () => null,
            fetchUser: async () => null,
        },
    );

    const renderedBuf = await service.renderReportImage('g1', 7, false, 'christmas-wonderland');
    assert.deepEqual(renderedBuf.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const result = await service.sendReport('g1', 7, { mentionUnpaid: true, theme: 'minimal-finance' });
    assert.equal(result.channelName, 'finance');
    assert.equal(sentPayloads.length, 1);
    assert.match(sentPayloads[0].content, /<@222222222222222222>/);
    assert.equal(sentPayloads[0].files[0].name, 'fund-report.png');
    assert.deepEqual(sentPayloads[0].files[0].attachment.subarray(0, 4), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
});
