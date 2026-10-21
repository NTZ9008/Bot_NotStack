const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { PrismaService } = require('../apps/backend/dist/prisma/prisma.service');
const { FundService } = require('../apps/backend/dist/fund/fund.service');
const url = process.env.XP_TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== '/notstack_xp_test') throw Error('Use the disposable test cluster: pnpm test:integration');
const prisma = new PrismaService({ get: () => url });
// บอทไม่ได้ login — หาชื่อ/รูปจาก fetchUser อย่างเดียว
const discord = {
    guild: () => null,
    fetchUser: async (id) => ({ globalName: `User ${id}`, username: `user${id}`, displayAvatarURL: () => `avatar-${id}` }),
};
const fund = new FundService(prisma, discord);
before(() => prisma.$connect());
beforeEach(() => prisma.fundTopic.deleteMany());
after(() => prisma.$disconnect());

const paidOf = (detail, userId) => detail.members.find((m) => m.userId === userId).paid;

test('fund topics keep totals in sync while members and payments change', async () => {
    const topic = await fund.create('g1', { name: 'ค่าห้อง', amountPerMember: 300 });
    assert.deepEqual(await fund.addMembers('g1', topic.id, { userIds: ['111111', '222222'] }), { added: 2, skipped: 0 });
    assert.deepEqual(await fund.addMembers('g1', topic.id, { userIds: ['111111'] }), { added: 0, skipped: 1 });

    let detail = await fund.detail('g1', topic.id);
    const [a, b] = detail.members;
    assert.equal(a.displayName, 'User 111111');
    assert.equal(a.avatar, 'avatar-111111');
    await fund.addPayment('g1', topic.id, { memberId: a.id, amount: 100, note: 'งวด 1' }, 'tester');
    await fund.addPayment('g1', topic.id, { memberId: a.id, amount: 200 }, 'tester');
    await fund.batchPayments(
        'g1',
        topic.id,
        { memberIds: [b.id], amount: 50, periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-10-05T23:59:59.000Z' },
        'tester',
    );

    detail = await fund.detail('g1', topic.id);
    assert.equal(detail.collected, 350);
    assert.equal(detail.target, 600);
    assert.equal(detail.paidCount, 1);
    assert.deepEqual(
        detail.members.map((m) => m.status),
        ['paid', 'partial'],
    );
    assert.equal(detail.payments.find((p) => p.memberId === b.id).periodStart, '2026-10-01T00:00:00.000Z');
    assert.match((await fund.exportCsv('g1', topic.id)).filename, /^fund-ค่าห้อง-\d{4}-\d{2}-\d{2}\.csv$/);

    // หัวข้อของเซิร์ฟเวอร์อื่นแก้ไม่ได้
    await assert.rejects(fund.detail('other', topic.id), /ไม่พบหัวข้อ/);
    await assert.rejects(fund.removeMember('other', topic.id, a.id), /ไม่พบหัวข้อ/);
});

test('editing the paid amount rewrites payments atomically and respects closed topics', async () => {
    const topic = await fund.create('g1', { name: 'กองกลาง', amountPerMember: 100 });
    await fund.addMembers('g1', topic.id, { userIds: ['333333'] });
    const member = (await fund.detail('g1', topic.id)).members[0];
    for (const [amount, paidAt] of [
        [30, '2026-10-01T00:00:00Z'],
        [20, '2026-10-02T00:00:00Z'],
        [10, '2026-10-03T00:00:00Z'],
    ]) {
        await fund.addPayment('g1', topic.id, { memberId: member.id, amount, paidAt }, 'tester');
    }

    // ลดจาก 60 → 35: ลบรายการล่าสุด (10) แล้วหักรายการถัดไป 20 → 15... เหลือ 30 + 5 = 35
    await fund.updateMember('g1', topic.id, member.id, { paidAmount: 35 }, 'editor');
    let detail = await fund.detail('g1', topic.id);
    assert.equal(paidOf(detail, '333333'), 35);
    assert.deepEqual(
        detail.payments.map((p) => [p.amount, p.recordedBy]),
        [
            [5, 'editor'],
            [30, 'tester'],
        ],
    );

    // เพิ่มเป็น 80 → บวกเข้ารายการล่าสุด
    await fund.updateMember('g1', topic.id, member.id, { paidAmount: 80, targetAmount: 120 }, 'editor');
    detail = await fund.detail('g1', topic.id);
    assert.equal(paidOf(detail, '333333'), 80);
    assert.equal(detail.members[0].target, 120);
    assert.equal(detail.members[0].customTarget, true);

    // 0 → ลบทุกรายการ
    await fund.updateMember('g1', topic.id, member.id, { paidAmount: 0 }, 'editor');
    assert.equal((await fund.detail('g1', topic.id)).payments.length, 0);

    // ปิดหัวข้อแล้ว แก้ยอด/บันทึกรับเงินไม่ได้ และไม่มีอะไรถูกเขียนไปครึ่งทาง
    await fund.update('g1', topic.id, { closed: true });
    await assert.rejects(
        fund.updateMember('g1', topic.id, member.id, { paidAmount: 50, targetAmount: 999 }),
        /ปิดการเก็บเงินแล้ว — เปิดอีกครั้งก่อนแก้ไขยอดเงิน/,
    );
    await assert.rejects(fund.addPayment('g1', topic.id, { memberId: member.id, amount: 10 }, 'x'), /เปิดอีกครั้งก่อนบันทึกรายการ/);
    detail = await fund.detail('g1', topic.id);
    assert.equal(detail.members[0].target, 120);
    assert.equal(detail.payments.length, 0);
});

test('topic dates can be set, kept and cleared through partial updates', async () => {
    const topic = await fund.create('g1', {
        name: 'รายวัน',
        amountPerMember: 0,
        dailyRate: 15,
        startDate: '2026-10-01T00:00:00.000Z',
        dueDate: '2026-10-31T23:59:00.000Z',
    });
    assert.equal(topic.dailyRate, 15);
    let updated = await fund.update('g1', topic.id, { name: 'รายวัน 2' });
    assert.equal(updated.startDate, '2026-10-01T00:00:00.000Z');
    assert.equal(updated.dueDate, '2026-10-31T23:59:00.000Z');
    updated = await fund.update('g1', topic.id, { dueDate: null, dailyRate: null });
    assert.equal(updated.dueDate, null);
    assert.equal(updated.dailyRate, null);
    assert.equal(updated.startDate, '2026-10-01T00:00:00.000Z');
});
