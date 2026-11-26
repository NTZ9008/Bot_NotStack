const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(require('node:path').resolve('apps/backend/package.json'));
req('reflect-metadata');
const {
    REMINDER_TIMEZONE,
    buildDailyCron,
    buildWeeklyCron,
    formatBangkokDateTimeInput,
    parseBangkokDateTimeInput,
    parseDailyCron,
    parseWeeklyCron,
    reminderInputSchema,
    updateReminderSchema,
} = req('@notstack/shared');

const { computeNextRunAt, cronTimeSchema, isValidCronTime } = require('../apps/backend/dist/reminders/utils/reminder-schedule');
const { RemindersService } = require('../apps/backend/dist/reminders/reminders.service');
const { ScheduledReminderTask } = require('../apps/backend/dist/reminders/tasks/scheduled-reminder.task');

const GUILD_A = '11111111111111111';
const GUILD_B = '22222222222222222';
const CHANNEL_A = '33333333333333333';
const ROLE_A = '44444444444444444';

function createRemindersPrisma() {
    let nextId = 1;
    const rows = [];

    return {
        rows,
        scheduledReminder: {
            async findMany({ where, orderBy, take } = {}) {
                let items = rows.filter((r) => {
                    if (where?.guildId && r.guildId !== where.guildId) return false;
                    if (where?.enabled !== undefined && r.enabled !== where.enabled) return false;
                    if (where?.nextRunAt?.lte && (!r.nextRunAt || r.nextRunAt.getTime() > where.nextRunAt.lte.getTime())) return false;
                    return true;
                });
                if (orderBy) {
                    items = [...items].sort((a, b) => a.id - b.id);
                }
                if (take) items = items.slice(0, take);
                return items.map((r) => ({ ...r }));
            },
            async findFirst({ where }) {
                const found = rows.find((r) => (!where?.id || r.id === where.id) && (!where?.guildId || r.guildId === where.guildId));
                return found ? { ...found } : null;
            },
            async count({ where }) {
                return rows.filter((r) => !where?.guildId || r.guildId === where.guildId).length;
            },
            async create({ data }) {
                const now = new Date();
                const row = {
                    id: nextId++,
                    guildId: data.guildId,
                    title: data.title,
                    channelId: data.channelId,
                    message: data.message,
                    useEmbed: data.useEmbed ?? true,
                    embedColor: data.embedColor ?? null,
                    mentionRoleId: data.mentionRoleId ?? null,
                    scheduleType: data.scheduleType,
                    cronExpression: data.cronExpression ?? null,
                    runAt: data.runAt ?? null,
                    timezone: data.timezone ?? REMINDER_TIMEZONE,
                    enabled: data.enabled ?? true,
                    nextRunAt: data.nextRunAt ?? null,
                    lastRunAt: data.lastRunAt ?? null,
                    lastError: data.lastError ?? null,
                    createdAt: now,
                    updatedAt: now,
                };
                rows.push(row);
                return { ...row };
            },
            async update({ where, data }) {
                const row = rows.find((r) => r.id === where.id);
                if (!row) throw new Error('Not found');
                Object.assign(row, data, { updatedAt: new Date() });
                return { ...row };
            },
            async delete({ where }) {
                const idx = rows.findIndex((r) => r.id === where.id);
                if (idx >= 0) rows.splice(idx, 1);
                return {};
            },
        },
    };
}

test('shared reminder schemas and cron/Bangkok datetime helpers validate and convert formats', () => {
    assert.equal(buildDailyCron('09:30'), '30 9 * * *');
    assert.equal(parseDailyCron('30 9 * * *'), '09:30');
    assert.equal(parseDailyCron('0 9 * * 1-5'), null);

    assert.equal(buildWeeklyCron('18:05', [5, 1, 5]), '5 18 * * 1,5');
    assert.deepEqual(parseWeeklyCron('5 18 * * 1,5'), { time: '18:05', days: [1, 5] });

    const parsedDt = parseBangkokDateTimeInput('2026-12-01T09:30');
    assert.equal(parsedDt.toISOString(), '2026-12-01T02:30:00.000Z');
    assert.equal(formatBangkokDateTimeInput(parsedDt), '2026-12-01T09:30');

    const validOnce = reminderInputSchema.parse({
        title: ' ประชุมทีม ',
        channelId: CHANNEL_A,
        message: 'เตรียมสรุปงานประจำสัปดาห์',
        useEmbed: true,
        embedColor: '#5865F2',
        mentionRoleId: '',
        scheduleType: 'ONCE',
        runAt: '2026-12-01T09:30',
    });
    assert.equal(validOnce.title, 'ประชุมทีม');
    assert.equal(validOnce.embedColor, '#5865f2');
    assert.equal(validOnce.mentionRoleId, null);

    assert.equal(
        reminderInputSchema.safeParse({
            title: 'Missing runAt',
            channelId: CHANNEL_A,
            message: 'Hello',
            scheduleType: 'ONCE',
        }).success,
        false,
    );
    assert.equal(
        reminderInputSchema.safeParse({
            title: 'Bad cron',
            channelId: CHANNEL_A,
            message: 'Hello',
            scheduleType: 'CRON',
            cronExpression: '99 99 * * *',
        }).success,
        false,
    );
    assert.equal(updateReminderSchema.safeParse({}).success, false);
    assert.deepEqual(updateReminderSchema.parse({ enabled: false }), { enabled: false });
});

test('CronTime helper computes nextRunAt in Asia/Bangkok and validates Cron expressions with Zod', () => {
    assert.equal(isValidCronTime('30 9 * * 1-5', REMINDER_TIMEZONE), true);
    assert.equal(isValidCronTime('not-a-cron', REMINDER_TIMEZONE), false);
    assert.equal(cronTimeSchema.safeParse('0 9 * * *').success, true);
    assert.equal(cronTimeSchema.safeParse('invalid cron').success, false);

    // 2026-11-26 09:00:00+07:00 === 2026-11-26T02:00:00.000Z
    const beforeTrigger = new Date('2026-11-26T02:00:00.000Z');
    const nextSameDay = computeNextRunAt(
        { scheduleType: 'DAILY', cronExpression: '30 9 * * *', runAt: null, timezone: REMINDER_TIMEZONE },
        beforeTrigger,
    );
    assert.equal(nextSameDay.toISOString(), '2026-11-26T02:30:00.000Z');

    // Once triggered at 09:30 Bangkok, next occurrence is the following day 09:30 Bangkok
    const atTrigger = new Date('2026-11-26T02:30:00.000Z');
    const nextDay = computeNextRunAt(
        { scheduleType: 'DAILY', cronExpression: '30 9 * * *', runAt: null, timezone: REMINDER_TIMEZONE },
        atTrigger,
    );
    assert.equal(nextDay.toISOString(), '2026-11-27T02:30:00.000Z');

    const onceDate = new Date('2027-01-01T00:00:00.000Z');
    assert.equal(computeNextRunAt({ scheduleType: 'ONCE', cronExpression: null, runAt: onceDate }).toISOString(), onceDate.toISOString());

    assert.throws(
        () => computeNextRunAt({ scheduleType: 'CRON', cronExpression: 'invalid', runAt: null, timezone: REMINDER_TIMEZONE }),
        (err) => err.getStatus?.() === 400,
    );
});

test('RemindersService supports CRUD, testSend (Embed/Text), ONCE auto-disable, and recurring reschedule', async () => {
    const prisma = createRemindersPrisma();
    const sentMessages = [];
    const fakeChannel = {
        guildId: GUILD_A,
        isSendable: () => true,
        async send(payload) {
            sentMessages.push(payload);
        },
    };
    const discord = {
        ready: {},
        requireReady() {},
        async fetchGuildChannel(guildId, channelId) {
            return guildId === GUILD_A && channelId === CHANNEL_A ? fakeChannel : null;
        },
    };

    const service = new RemindersService(prisma, discord);

    // Rejects past ONCE date when enabled
    await assert.rejects(
        () =>
            service.create(GUILD_A, {
                title: 'Past reminder',
                channelId: CHANNEL_A,
                message: 'Should fail',
                useEmbed: true,
                scheduleType: 'ONCE',
                runAt: '2020-01-01T10:00',
            }),
        (err) => err.getStatus?.() === 400,
    );

    const futureIso = new Date(Date.now() + 2 * 3600_000).toISOString();
    const onceReminder = await service.create(GUILD_A, {
        title: 'One-off Meeting',
        channelId: CHANNEL_A,
        message: 'Join voice room #general',
        useEmbed: true,
        embedColor: '#10b981',
        mentionRoleId: ROLE_A,
        scheduleType: 'ONCE',
        runAt: futureIso,
    });
    assert.equal(onceReminder.enabled, true);
    assert.equal(onceReminder.nextRunAt, futureIso);

    const dailyReminder = await service.create(GUILD_A, {
        title: 'Daily Standup',
        channelId: CHANNEL_A,
        message: 'Post your updates!',
        useEmbed: false,
        scheduleType: 'DAILY',
        cronExpression: '0 9 * * *',
    });
    assert.ok(dailyReminder.nextRunAt);

    const listRes = await service.list(GUILD_A);
    assert.equal(listRes.summary.total, 2);
    assert.equal(listRes.summary.enabled, 2);
    assert.equal(listRes.summary.recurring, 1);
    assert.equal(listRes.summary.oncePending, 1);

    // Test Send Embed does NOT disable ONCE or wipe nextRunAt
    const afterTestOnce = await service.testSend(GUILD_A, onceReminder.id);
    assert.equal(sentMessages.length, 1);
    assert.equal(sentMessages[0].content, `<@&${ROLE_A}>`);
    assert.equal(sentMessages[0].embeds.length, 1);
    assert.deepEqual(sentMessages[0].allowedMentions, { roles: [ROLE_A] });
    assert.equal(afterTestOnce.enabled, true);
    assert.equal(afterTestOnce.nextRunAt, futureIso);
    assert.equal(afterTestOnce.lastRunAt, null);

    // Test Send Plain Text
    await service.testSend(GUILD_A, dailyReminder.id);
    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[1].embeds, undefined);
    assert.match(sentMessages[1].content, /\*\*Daily Standup\*\*\nPost your updates!/);

    // Execute due ONCE reminder -> sets lastRunAt, disables enabled, clears nextRunAt
    const runNow = new Date('2026-11-26T02:00:00.000Z');
    await service.executeDueReminder(prisma.rows[0], runNow);
    assert.equal(prisma.rows[0].enabled, false);
    assert.equal(prisma.rows[0].nextRunAt, null);
    assert.equal(prisma.rows[0].lastRunAt.toISOString(), runNow.toISOString());
    assert.equal(prisma.rows[0].lastError, null);

    // Execute due DAILY reminder -> updates lastRunAt and advances nextRunAt
    await service.executeDueReminder(prisma.rows[1], runNow);
    assert.equal(prisma.rows[1].enabled, true);
    assert.equal(prisma.rows[1].lastRunAt.toISOString(), runNow.toISOString());
    assert.equal(prisma.rows[1].nextRunAt.toISOString(), '2026-11-27T02:00:00.000Z');

    // Toggle off -> clears nextRunAt; toggle on -> recomputes nextRunAt
    const disabled = await service.update(GUILD_A, dailyReminder.id, { enabled: false });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.nextRunAt, null);
    const reenabled = await service.update(GUILD_A, dailyReminder.id, { enabled: true });
    assert.equal(reenabled.enabled, true);
    assert.ok(reenabled.nextRunAt);
});

test('ScheduledReminderTask polls due reminders and skips guilds without scheduled-reminders plugin installed', async () => {
    const prisma = createRemindersPrisma();
    const past = new Date(Date.now() - 5000);

    await prisma.scheduledReminder.create({
        data: {
            guildId: GUILD_A,
            title: 'Eligible Reminder',
            channelId: CHANNEL_A,
            message: 'Ping!',
            scheduleType: 'ONCE',
            runAt: past,
            nextRunAt: past,
            enabled: true,
        },
    });
    await prisma.scheduledReminder.create({
        data: {
            guildId: GUILD_B,
            title: 'Uninstalled Plugin Guild',
            channelId: CHANNEL_A,
            message: 'Should be skipped',
            scheduleType: 'ONCE',
            runAt: past,
            nextRunAt: past,
            enabled: true,
        },
    });
    await prisma.scheduledReminder.create({
        data: {
            guildId: GUILD_A,
            title: 'Future Reminder',
            channelId: CHANNEL_A,
            message: 'Not due yet',
            scheduleType: 'ONCE',
            runAt: new Date(Date.now() + 300_000),
            nextRunAt: new Date(Date.now() + 300_000),
            enabled: true,
        },
    });

    const executedIds = [];
    const remindersStub = {
        async executeDueReminder(item) {
            executedIds.push(item.id);
        },
    };
    const pluginsStub = {
        async isInstalled(guildId, pluginId) {
            return guildId === GUILD_A && pluginId === 'scheduled-reminders';
        },
    };

    const task = new ScheduledReminderTask(prisma, remindersStub, pluginsStub, { ready: {} });
    await task.tick();

    assert.deepEqual(executedIds, [1]);
});
