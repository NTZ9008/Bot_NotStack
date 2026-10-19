const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createFundTopicSchema,
    updateFundTopicSchema,
    addFundMembersSchema,
    updateFundMemberSchema,
    createFundPaymentSchema,
    sendFundReportSchema,
    roundMoney,
    formatBaht,
    fundMemberStatus,
} = require('../packages/shared/dist');
const { buildFundReport, progressBar } = require('../apps/backend/dist/fund/utils/fund-report');

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
