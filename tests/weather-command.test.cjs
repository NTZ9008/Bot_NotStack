const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaultWeatherOptions } = require('../packages/shared/dist');
const { WeatherCommand } = require('../apps/backend/dist/commands/slash/weather.command');
const { WeatherService } = require('../apps/backend/dist/weather/weather.service');
const { weatherApiError } = require('../apps/backend/dist/weather/exceptions/weather.exception');
const { MessageFlags } = require('../apps/backend/node_modules/discord.js');

// ภาพเรดาร์ดึงจากเน็ต — ในเทสต์ให้ต้นทางตอบ 503 ทุกครั้ง (รายงานยังต้องส่งได้ แค่ไม่มีเรดาร์)
globalThis.fetch = async () => new Response('', { status: 503 });

const NOW = 1_790_000_000;
const weatherData = {
    fetchedAt: NOW * 1000,
    timezone: 25200,
    cityId: 1607779,
    cityName: 'Salaya',
    current: {
        dt: NOW,
        temp: 31.4,
        feelsLike: 36.2,
        humidity: 70,
        pressure: 1008,
        windSpeed: 3,
        windDeg: 200,
        clouds: 40,
        visibility: 10000,
        condition: 'เมฆเป็นบางส่วน',
        icon: '03d',
        sunrise: NOW - 3600,
        sunset: NOW + 36000,
    },
    forecast: Array.from({ length: 17 }, (_, i) => ({ dt: NOW + i * 10800, temp: 28 + (i % 5), pop: i === 4 ? 0.8 : 0.1, rain: i === 4 ? 2.5 : 0, icon: '10d', condition: 'ฝนเล็กน้อย' })),
    air: { pm25: 18.2, pm10: 30 },
};

function fixture({ stored, places = [], fetchError } = {}) {
    const calls = { findUnique: [], createMany: 0, search: [], fetch: [] };
    const prisma = {
        weatherSetting: {
            findUnique: async (args) => {
                calls.findUnique.push(args);
                return stored ? { options: stored } : null;
            },
            createMany: async () => {
                calls.createMany++;
            },
        },
    };
    const owm = {
        searchLocations: async (query) => {
            calls.search.push(query);
            return places;
        },
        fetchWeather: async (location, opts) => {
            calls.fetch.push({ location, opts });
            if (fetchError) throw fetchError;
            return weatherData;
        },
    };
    const service = new WeatherService(prisma, {}, {}, owm);
    return { calls, command: new WeatherCommand(service) };
}

// ผู้ใช้คนละคนทุกครั้ง (ถ้าไม่ระบุ) — ไม่ติด cooldown ของกันและกัน
let nextUser = 0;
function interaction({ guildId = 'g1', city = null, userId = `u${++nextUser}` } = {}) {
    const state = { deferred: false, replies: [], ephemeral: [] };
    return {
        state,
        guildId,
        user: { id: userId },
        options: { getString: (name) => (name === 'city' ? city : null) },
        reply: async (payload) => {
            state.ephemeral.push(payload);
        },
        deferReply: async () => {
            state.deferred = true;
        },
        editReply: async (payload) => {
            state.replies.push(typeof payload === 'string' ? { content: payload } : payload);
        },
    };
}

const serverOptions = () => {
    const options = defaultWeatherOptions();
    options.location = { name: 'บางกอกน้อย', lat: 13.77, lon: 100.47, country: 'TH' };
    options.embed.title = 'อากาศวันนี้ที่ {location}';
    options.embed.color = '#123456';
    options.embed.fields = ['temp', 'rain', 'pm25'];
    options.radar.enabled = false;
    return options;
};

test('/weather without a city shows the server daily report (location, style, chart) and never creates a settings row', async () => {
    const { calls, command } = fixture({ stored: serverOptions() });
    const ix = interaction();
    await command.execute(ix);

    assert.equal(ix.state.deferred, true);
    assert.deepEqual(calls.findUnique[0].where, { guildId: 'g1' });
    assert.equal(calls.createMany, 0);
    assert.deepEqual(calls.search, []);
    assert.equal(calls.fetch[0].location.name, 'บางกอกน้อย');
    // ใช้ cache ของ OpenWeatherClient (ไม่ส่ง fresh: true)
    assert.equal(calls.fetch[0].opts, undefined);

    const [reply] = ix.state.replies;
    assert.equal(reply.content, undefined, 'ไม่ส่งข้อความคู่ embed ของรายงานตามเวลา');
    assert.equal(reply.embeds.length, 1);
    const embed = reply.embeds[0].toJSON();
    assert.equal(embed.title, 'อากาศวันนี้ที่ บางกอกน้อย');
    assert.equal(embed.color, 0x123456);
    assert.deepEqual(
        embed.fields.map((field) => field.name),
        ['🌡️ อุณหภูมิ', '☔ โอกาสฝนตก', '😷 PM2.5'],
    );
    assert.equal(embed.image.url, 'attachment://weather-chart.png');
    assert.deepEqual(
        reply.files.map((file) => file.name),
        ['weather-chart.png'],
    );
});

test('/weather with a city keeps the server style but swaps in the searched place', async () => {
    const place = { name: 'เชียงใหม่', nameEn: 'Chiang Mai', state: 'Chiang Mai Province', country: 'TH', lat: 18.7883, lon: 98.9853 };
    const { calls, command } = fixture({ stored: serverOptions(), places: [place] });
    const ix = interaction({ city: '  เชียงใหม่ ' });
    await command.execute(ix);

    assert.deepEqual(calls.search, ['เชียงใหม่']);
    assert.deepEqual(calls.fetch[0].location, { name: 'เชียงใหม่', lat: 18.7883, lon: 98.9853, country: 'TH' });
    assert.equal(ix.state.replies[0].embeds[0].toJSON().title, 'อากาศวันนี้ที่ เชียงใหม่');
});

test('/weather in a DM or an unconfigured server uses the default report and still replies when radar fails', async () => {
    const { calls, command } = fixture();
    const dm = interaction({ guildId: null });
    await command.execute(dm);

    assert.deepEqual(calls.findUnique, []);
    assert.equal(calls.fetch[0].location.name, defaultWeatherOptions().location.name);
    const [reply] = dm.state.replies;
    assert.equal(reply.embeds[0].toJSON().title, `รายงานสภาพอากาศ ${defaultWeatherOptions().location.name}`);
    assert.deepEqual(
        reply.files.map((file) => file.name),
        ['weather-chart.png'],
    );

    const fresh = interaction({ guildId: 'new-guild' });
    await command.execute(fresh);
    assert.equal(calls.createMany, 0);
    assert.equal(fresh.state.replies[0].embeds.length, 1);
});

test('/weather reports unknown places and OpenWeatherMap errors without mentions', async () => {
    const missing = fixture({ places: [] });
    const ix = interaction({ city: '@everyone' });
    await missing.command.execute(ix);
    assert.equal(ix.state.replies[0].content, '❌ ไม่พบสถานที่ **@everyone**');
    assert.deepEqual(ix.state.replies[0].allowedMentions, { parse: [] });
    assert.deepEqual(missing.calls.fetch, []);

    const down = fixture({ fetchError: weatherApiError('เรียก OpenWeatherMap บ่อยเกินโควตา กรุณารอสักครู่') });
    const err = interaction();
    await down.command.execute(err);
    assert.equal(err.state.replies[0].content, '❌ เรียก OpenWeatherMap บ่อยเกินโควตา กรุณารอสักครู่');
    assert.deepEqual(err.state.replies[0].embeds, []);
});

test('/weather has a 30-second per-user cooldown that does not block other users', async (t) => {
    let now = 1_800_000_000_000;
    t.mock.method(Date, 'now', () => now);
    const { calls, command } = fixture({ stored: serverOptions() });

    await command.execute(interaction({ userId: 'alice' }));
    assert.equal(calls.fetch.length, 1);

    now += 29_000;
    const spam = interaction({ userId: 'alice', city: 'เชียงใหม่' });
    await command.execute(spam);
    assert.equal(spam.state.deferred, false);
    assert.deepEqual(spam.state.replies, []);
    assert.equal(spam.state.ephemeral[0].content, `⏳ ใช้ /weather ได้อีกครั้ง <t:${(1_800_000_000_000 + 30_000) / 1000}:R>`);
    assert.equal(spam.state.ephemeral[0].flags, MessageFlags.Ephemeral);
    assert.deepEqual(calls.search, []);
    assert.equal(calls.fetch.length, 1);

    const other = interaction({ userId: 'bob' });
    await command.execute(other);
    assert.equal(other.state.replies[0].embeds.length, 1);

    now += 1_000;
    const later = interaction({ userId: 'alice' });
    await command.execute(later);
    assert.equal(later.state.replies[0].embeds.length, 1);
    assert.equal(calls.fetch.length, 3);
});
