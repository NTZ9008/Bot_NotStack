// ==========================================
// 🌤️ DAILY WEATHER REPORT — หน้าตั้งค่ารายงานสภาพอากาศประจำวัน (ADMIN)
// - 4 หมวด: เวลา & ห้อง / สถานที่ / ข้อความ & ข้อมูล / กราฟ — แก้แล้วกด "บันทึก" (Ctrl/⌘ + S)
// - สวิตช์เปิด/ปิดบันทึกทันที
// - ตัวอย่างสร้างที่ server ด้วยโค้ดเดียวกับตอนส่งจริง (ใช้ข้อมูลอากาศจริง cache 10 นาที)
// ==========================================

const WX_HEX = /^#[0-9a-fA-F]{6}$/;
const WX_PREVIEW_DELAY = 400;
// ฟิลด์ที่ต้องกดบันทึก (enabled แยกไปบันทึกทันทีจากสวิตช์)
const WX_DRAFT_FIELDS = ['channelId', 'content', 'options'];
const WX_DAYS = [
    { value: 1, label: 'จ' },
    { value: 2, label: 'อ' },
    { value: 3, label: 'พ' },
    { value: 4, label: 'พฤ' },
    { value: 5, label: 'ศ' },
    { value: 6, label: 'ส' },
    { value: 0, label: 'อา' },
];
const WX_THEME_LABELS = { light: 'สว่าง', dark: 'มืด' };

const wx = {
    loaded: false,
    loading: null,
    meta: null,
    channels: [],
    roles: [],
    saved: null,       // ค่าตามที่อยู่ในฐานข้อมูล — ใช้เทียบว่ามีการแก้ไขค้างอยู่ไหม
    draft: null,       // ค่าที่กำลังแก้
    section: 'schedule',
    places: [],        // ผลค้นหาสถานที่ล่าสุด
    previewTimer: null,
    previewSeq: 0,
    bound: false,
};

const wxClone = (value) => JSON.parse(JSON.stringify(value));
const wxPick = (settings) => Object.fromEntries(WX_DRAFT_FIELDS.map((key) => [key, settings[key]]));
const wxIsDirty = () => Boolean(wx.draft && wx.saved) && JSON.stringify(wxPick(wx.draft)) !== JSON.stringify(wxPick(wx.saved));

async function wxApi(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function wxToast(icon, title, text) {
    Swal.fire({ toast: true, position: 'top-end', icon, title, text, showConfirmButton: false, timer: 2500, timerProgressBar: true });
}

function wxError(title, err) {
    Swal.fire({ icon: 'error', title, text: err.message || String(err), confirmButtonColor: '#6366f1' });
}

// เวลาไทยแบบอ่านง่าย เช่น "พฤ. 25 ก.ย. 07:00 น."
function wxFormatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    return `${date.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })} `
        + `${date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })} น.`;
}

function wxChannelName(channelId) {
    if (!channelId) return null;
    const channel = wx.channels.find((ch) => ch.id === channelId);
    return channel ? `#${channel.name}` : `ID: ${channelId}`;
}

// ==========================================
// โหลดข้อมูล — เรียกจาก switchTab ตอนเปิดแท็บ Weather
// ==========================================
function loadWeatherTab() {
    if (!wx.loading) wx.loading = wxInit();
    else if (wx.loaded) wxSchedulePreview(0);
    return wx.loading;
}

async function wxInit() {
    try {
        const [meta, settings, channelsRes, rolesRes] = await Promise.all([
            wxApi('GET', '/api/weather/meta'),
            wxApi('GET', '/api/weather/settings'),
            fetch('/api/guild-channels'),
            fetch('/api/guild-roles'),
        ]);
        wx.meta = meta;
        // บอทยังไม่ออนไลน์ → ยังแก้ค่าได้ แค่รายชื่อห้อง/ยศว่าง
        wx.channels = channelsRes.ok ? (await channelsRes.json()).filter((ch) => ch.sendable) : [];
        wx.roles = rolesRes.ok ? await rolesRes.json() : [];

        if (meta.bot) {
            document.getElementById('wx-bot-avatar').src = meta.bot.avatar;
            document.getElementById('wx-bot-name').textContent = meta.bot.name;
        }
        document.getElementById('wx-key-warning').classList.toggle('hidden', meta.apiKeyConfigured);

        wxBindStaticEvents();
        wx.loaded = true;
        document.getElementById('wx-loading').classList.add('hidden');
        document.getElementById('wx-content').classList.remove('hidden');
        wxLoadSettings(settings);
    } catch (err) {
        console.error('Error loading weather tab:', err);
        wx.loading = null; // เปิดแท็บใหม่อีกครั้งเพื่อลองโหลดซ้ำได้
        document.getElementById('wx-loading').innerHTML = `<p class="cell-error">โหลดข้อมูล Weather ไม่สำเร็จ: ${escapeHtml(err.message)}</p>`;
    }
}

// รับค่าที่ server ตรวจแล้ว (ตอนโหลดครั้งแรก / หลังบันทึก) มาเป็นทั้งค่าที่บันทึกไว้และค่าที่กำลังแก้
function wxLoadSettings(settings) {
    wx.saved = wxClone(settings);
    wx.draft = wxClone(settings);
    wxRenderHead();
    wxRenderForm();
    wxUpdateDirty();
    wxSchedulePreview(0);
}

function wxRenderHead() {
    const s = wx.saved;
    document.getElementById('wx-enabled').checked = s.enabled;
    document.querySelectorAll('#wx-sections [data-section]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.section === wx.section);
    });

    const next = s.enabled && s.nextRunAt
        ? `<span class="wx-pill on">เปิดอยู่</span> ส่งครั้งถัดไป <strong>${escapeHtml(wxFormatDateTime(s.nextRunAt))}</strong> เข้า ${escapeHtml(wxChannelName(s.channelId) || '-')}`
        : '<span class="wx-pill">ปิดอยู่</span> ไม่ส่งรายงานตามเวลา';
    let last = 'ยังไม่เคยส่งตามเวลา';
    if (s.lastRunAt) {
        last = s.lastError
            ? `<span class="wx-bad">✗ ส่งไม่สำเร็จ</span> ${escapeHtml(wxFormatDateTime(s.lastRunAt))} — ${escapeHtml(s.lastError)}`
            : `<span class="wx-good">✓ ส่งสำเร็จ</span> ${escapeHtml(wxFormatDateTime(s.lastRunAt))}`;
    }
    document.getElementById('wx-status').innerHTML = `<div>${next}</div><div class="wx-status-last">ล่าสุด: ${last}</div>`;
}

function wxUpdateDirty() {
    const dirty = wxIsDirty();
    document.getElementById('wx-dirty').classList.toggle('hidden', !dirty);
    document.getElementById('wx-save-btn').disabled = !dirty;
    document.getElementById('wx-revert-btn').disabled = !dirty;
}

// ==========================================
// ตัวช่วยสร้างฟอร์ม — ทุกช่องมี data-path ชี้ไปที่ค่าใน wx.draft (เช่น options.embed.title)
// ==========================================
function wxGet(path) {
    return path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), wx.draft);
}

function wxSet(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    keys.reduce((obj, key) => obj[key], wx.draft)[last] = value;
}

function wxColor(label, path) {
    const value = wxGet(path);
    return `
        <div class="field">
            <label>${label}</label>
            <div class="color-field">
                <input type="color" class="color-swatch" value="${escapeHtml(value.toLowerCase())}" data-path="${path}" data-type="color">
                <input type="text" class="input" value="${escapeHtml(value)}" maxlength="7" spellcheck="false" data-path="${path}" data-type="color">
            </div>
        </div>`;
}

function wxSwitch(label, path, hint = '') {
    return `
        <label class="toggle-row">
            <span>${label}${hint ? `<small class="wx-toggle-hint">${hint}</small>` : ''}</span>
            <span class="switch">
                <input type="checkbox" data-path="${path}" data-type="bool" ${wxGet(path) ? 'checked' : ''}>
                <span class="slider"></span>
            </span>
        </label>`;
}

function wxSegmented(path, labels, type = 'text') {
    const current = String(wxGet(path));
    return `
        <div class="segmented wc-seg">
            ${Object.entries(labels).map(([value, text]) => `
                <button type="button" class="${value === current ? 'active' : ''}" data-set-path="${path}" data-set-value="${value}" data-set-type="${type}">${text}</button>`).join('')}
        </div>`;
}

function wxChips(targetPath) {
    return `
        <div class="wc-chips">
            ${wx.meta.placeholders.map((p) => `
                <button type="button" class="wc-chip" data-insert="{${p.key}}" data-target="${targetPath}" title="${escapeHtml(p.label)}">{${p.key}}</button>`).join('')}
        </div>`;
}

function wxChannelOptions(selectedId) {
    let html = '<option value="">— เลือกห้องที่จะส่ง —</option>';
    const byCategory = {};
    wx.channels.forEach((ch) => { (byCategory[ch.category] ||= []).push(ch); });
    Object.entries(byCategory).forEach(([category, channels]) => {
        html += `<optgroup label="${escapeHtml(category)}">`;
        channels.forEach((ch) => {
            html += `<option value="${escapeHtml(ch.id)}" ${ch.id === selectedId ? 'selected' : ''}>#${escapeHtml(ch.name)}</option>`;
        });
        html += '</optgroup>';
    });
    // ห้องที่ตั้งไว้แต่หาไม่เจอแล้ว (ถูกลบ / บอทมองไม่เห็น) — ยังคงค่าไว้ ไม่ให้หายไปเงียบๆ
    if (selectedId && !wx.channels.some((ch) => ch.id === selectedId)) {
        html += `<option value="${escapeHtml(selectedId)}" selected>ID: ${escapeHtml(selectedId)} (ไม่พบห้องนี้)</option>`;
    }
    return html;
}

// ==========================================
// ฟอร์มแต่ละหมวด
// ==========================================
function wxRenderForm() {
    const builders = { schedule: wxFormSchedule, location: wxFormLocation, embed: wxFormEmbed, chart: wxFormChart };
    document.getElementById('wx-form').innerHTML = (builders[wx.section] || wxFormSchedule)();
}

function wxFormSchedule() {
    const { schedule } = wx.draft.options;
    const { limits } = wx.meta;
    const roleOptions = wx.roles.map((r) => `<option value="${escapeHtml(r.id)}">@${escapeHtml(r.name)}</option>`).join('');
    return `
        <div class="field">
            <label for="wx-channel">ห้องที่จะส่ง</label>
            <select id="wx-channel" class="input-select" data-path="channelId" data-type="text">${wxChannelOptions(wx.draft.channelId)}</select>
            <span class="field-hint">${wx.channels.length ? 'บอทต้องมีสิทธิ์ดูห้อง ส่งข้อความ ฝังลิงก์ และแนบไฟล์ (สำหรับรูปกราฟ) ในห้องนี้' : 'บอทยังไม่ออนไลน์ จึงยังโหลดรายชื่อห้องไม่ได้'}</span>
        </div>

        <div class="field">
            <label for="wx-time">เวลาที่ส่ง</label>
            <input type="time" id="wx-time" class="input wx-time" step="60" value="${escapeHtml(schedule.time)}" data-path="options.schedule.time" data-type="time">
            <span class="field-hint">เวลาไทย (${escapeHtml(wx.meta.timezone)})</span>
        </div>

        <div class="field">
            <label>วันที่ส่ง</label>
            <div class="wx-days">
                ${WX_DAYS.map((d) => `<button type="button" class="wx-day ${schedule.days.includes(d.value) ? 'active' : ''}" data-day="${d.value}" aria-pressed="${schedule.days.includes(d.value)}">${d.label}</button>`).join('')}
            </div>
            <span class="field-hint">
                <button type="button" class="wc-link-btn" data-days="all">ทุกวัน</button> ·
                <button type="button" class="wc-link-btn" data-days="weekdays">จันทร์–ศุกร์</button> ·
                <button type="button" class="wc-link-btn" data-days="weekend">เสาร์–อาทิตย์</button>
            </span>
        </div>

        <div class="field">
            <label for="wx-content-input">ข้อความที่ส่งคู่กับ embed</label>
            <textarea id="wx-content-input" class="input" rows="3" maxlength="${limits.maxContentLength}" placeholder="เว้นว่างไว้ = ส่งแค่ embed" data-path="content" data-type="text">${escapeHtml(wx.draft.content)}</textarea>
            ${wxChips('content')}
            <div class="wx-inline-row">
                <select class="input-select" id="wx-role-insert" ${wx.roles.length ? '' : 'disabled'}>
                    <option value="">+ แท็กยศในข้อความ...</option>
                    ${roleOptions}
                </select>
            </div>
            <span class="field-hint">รองรับ Markdown ของ Discord · แท็กได้เฉพาะยศที่ใส่ไว้ในข้อความ (@everyone / @here จะไม่ทำงาน) · <span id="wx-content-count">${wx.draft.content.length}</span>/${limits.maxContentLength}</span>
        </div>`;
}

function wxFormLocation() {
    const { location } = wx.draft.options;
    const results = wx.places.map((p, i) => `
        <div class="wx-place">
            <div class="wx-place-main">
                <strong>${escapeHtml(p.name)}</strong>
                <small>${escapeHtml([p.nameEn !== p.name ? p.nameEn : '', p.state, p.country].filter(Boolean).join(' · '))}</small>
                <small class="wx-mono">${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}</small>
            </div>
            <button type="button" class="btn btn-secondary" data-pick="${i}">เลือก</button>
        </div>`).join('');

    return `
        <div class="wx-current-place">
            <span class="wx-place-icon">📍</span>
            <div>
                <strong>${escapeHtml(location.name)}</strong>
                <small class="wx-mono">${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}${location.country ? ` · ${escapeHtml(location.country)}` : ''}</small>
            </div>
        </div>

        <div class="field">
            <label for="wx-location-name">ชื่อที่แสดงในรายงาน</label>
            <input type="text" id="wx-location-name" class="input" maxlength="${wx.meta.limits.maxLocationNameLength}" value="${escapeHtml(location.name)}" data-path="options.location.name" data-type="text">
            <span class="field-hint">ใช้แทนตัวแปร {location} — เปลี่ยนชื่อได้โดยไม่ต้องค้นหาใหม่ (เช่น "ม.มหิดล ศาลายา")</span>
        </div>

        <div class="field">
            <label for="wx-place-query">เปลี่ยนสถานที่</label>
            <div class="wx-inline-row">
                <input type="text" id="wx-place-query" class="input" placeholder="เช่น ศาลายา, Bangkok หรือพิกัด 13.7946, 100.3234" autocomplete="off">
                <button type="button" class="btn btn-primary" id="wx-place-search">ค้นหา</button>
            </div>
            <span class="field-hint">พิมพ์ชื่อภาษาไทยหรืออังกฤษ หรือคัดลอกพิกัดจาก Google Maps มาวางเพื่อความแม่นยำ</span>
        </div>
        <div class="wx-places" id="wx-places">${results}</div>`;
}

function wxFieldList() {
    const selected = wx.draft.options.embed.fields;
    const byKey = new Map(wx.meta.fields.map((f) => [f.key, f]));
    // ช่องที่เลือกไว้ตามลำดับที่ตั้ง แล้วต่อด้วยช่องที่ยังไม่ได้เลือก
    const ordered = [...selected.map((key) => byKey.get(key)), ...wx.meta.fields.filter((f) => !selected.includes(f.key))];
    return ordered.map((field) => {
        const index = selected.indexOf(field.key);
        const on = index !== -1;
        return `
            <div class="wx-field-row ${on ? 'on' : ''}">
                <label class="wx-field-check">
                    <input type="checkbox" data-field-toggle="${field.key}" ${on ? 'checked' : ''}>
                    <span>
                        <strong>${escapeHtml(field.label)}</strong>
                        <small>${escapeHtml(field.hint)}</small>
                    </span>
                </label>
                ${on ? `
                <div class="wx-field-move">
                    <button type="button" class="wc-icon-btn" data-field-move="${field.key}" data-dir="-1" title="เลื่อนขึ้น" ${index === 0 ? 'disabled' : ''}>▲</button>
                    <button type="button" class="wc-icon-btn" data-field-move="${field.key}" data-dir="1" title="เลื่อนลง" ${index === selected.length - 1 ? 'disabled' : ''}>▼</button>
                </div>` : ''}
            </div>`;
    }).join('');
}

function wxFormEmbed() {
    const { limits } = wx.meta;
    const { embed } = wx.draft.options;
    return `
        ${wxColor('สีแถบด้านซ้ายของ embed', 'options.embed.color')}

        <div class="field">
            <label for="wx-title">หัวข้อ</label>
            <input type="text" id="wx-title" class="input" maxlength="${limits.maxTitleLength}" value="${escapeHtml(embed.title)}" data-path="options.embed.title" data-type="text">
            ${wxChips('options.embed.title')}
        </div>
        ${wxSwitch('ทำหัวข้อเป็นลิงก์ไปหน้าเมืองบน OpenWeatherMap', 'options.embed.link')}

        <div class="field stack-top">
            <label for="wx-description">รายละเอียด (ใต้หัวข้อ)</label>
            <textarea id="wx-description" class="input" rows="3" maxlength="${limits.maxDescriptionLength}" data-path="options.embed.description" data-type="text">${escapeHtml(embed.description)}</textarea>
            ${wxChips('options.embed.description')}
            <span class="field-hint">รองรับ Markdown ของ Discord · เว้นว่างได้</span>
        </div>

        <div class="field">
            <label>ช่องข้อมูล (${embed.fields.length}/${wx.meta.fields.length})</label>
            <div class="wx-field-list">${wxFieldList()}</div>
            <span class="field-hint">Discord เรียงช่องข้อมูลแถวละ 3 ช่อง — เลือก 3, 6 หรือ 9 ช่องจะได้ตารางเต็มแถวพอดี</span>
        </div>

        <div class="field">
            <label for="wx-footer">ข้อความท้าย embed</label>
            <input type="text" id="wx-footer" class="input" maxlength="${limits.maxFooterLength}" value="${escapeHtml(embed.footer)}" data-path="options.embed.footer" data-type="text">
            <span class="field-hint">เช่น แหล่งข้อมูล หรือเครดิตผู้ทำบอท (Discord แสดงเป็นตัวหนังสือเล็ก ไม่รองรับ Markdown)</span>
        </div>
        ${wxSwitch('แสดงวันเวลาที่ดึงข้อมูลท้าย embed', 'options.embed.timestamp')}
        ${wxSwitch('รูปไอคอนสภาพอากาศมุมขวาบน', 'options.embed.thumbnail', 'เมื่อเปิด Discord จะเรียงช่องข้อมูลแถวละ 2 ช่องแทน 3')}

        <div class="wc-help stack-top">
            <strong>ตัวแปรที่ใช้ได้ในหัวข้อ / รายละเอียด / ข้อความท้าย / ข้อความคู่ embed</strong>
            <ul>${wx.meta.placeholders.map((p) => `<li><code>{${p.key}}</code> ${escapeHtml(p.label)}</li>`).join('')}</ul>
        </div>`;
}

function wxFormChart() {
    const { chart } = wx.draft.options;
    const hours = Object.fromEntries(wx.meta.chartHours.map((h) => [h, `${h} ชม.`]));
    return `
        ${wxSwitch('แนบกราฟพยากรณ์ใน embed', 'options.chart.enabled', 'เส้นอุณหภูมิ + แท่งโอกาสฝนตก ทุก 3 ชั่วโมง')}
        <div class="wx-chart-options ${chart.enabled ? '' : 'wx-disabled'}">
            <div class="field stack-top">
                <label>ช่วงเวลาที่แสดง</label>
                ${wxSegmented('options.chart.hours', hours, 'int')}
            </div>
            ${wxSwitch('แสดงแท่งโอกาสฝนตก', 'options.chart.showRain')}
            <div class="field stack-top">
                <label>ธีมของกราฟ</label>
                ${wxSegmented('options.chart.theme', WX_THEME_LABELS)}
            </div>
            ${wxColor('สีเส้นอุณหภูมิ', 'options.chart.color')}
        </div>`;
}

// ==========================================
// รับค่าจากฟอร์ม
// ==========================================
function wxParseInput(el) {
    const type = el.dataset.type;
    if (type === 'bool') return el.checked;
    // สีเก็บเป็นตัวพิมพ์ใหญ่เหมือนที่ server เก็บ — จะได้เทียบว่ามีการแก้ไขได้ตรง
    if (type === 'color') return WX_HEX.test(el.value.trim()) ? el.value.trim().toUpperCase() : undefined;
    if (type === 'time') return /^\d{2}:\d{2}$/.test(el.value) ? el.value : undefined;
    return el.value;
}

// ให้ทุกช่องที่ผูกกับ path เดียวกันแสดงค่าล่าสุด (ยกเว้นช่องที่ผู้ใช้กำลังพิมพ์อยู่)
function wxSyncInputs(path, value, except) {
    document.querySelectorAll(`#wx-form [data-path="${path}"]`).forEach((el) => {
        if (el === except) return;
        if (el.dataset.type === 'bool') el.checked = Boolean(value);
        else if (el.dataset.type === 'color') el.value = el.type === 'color' ? value.toLowerCase() : value;
        else el.value = value;
    });
}

function wxApplyInput(el) {
    const path = el.dataset.path;
    const value = wxParseInput(el);
    if (value === undefined) return;
    wxSet(path, value);
    wxSyncInputs(path, value, el);
    wxAfterChange(path);
}

function wxAfterChange(path) {
    if (path === 'content') {
        const counter = document.getElementById('wx-content-count');
        if (counter) counter.textContent = wx.draft.content.length;
    } else if (path === 'options.chart.enabled') {
        document.querySelector('.wx-chart-options')?.classList.toggle('wx-disabled', !wx.draft.options.chart.enabled);
    }
    // ห้อง / เวลา / วัน ไม่มีผลกับหน้าตารายงาน — ไม่ต้องขอตัวอย่างใหม่
    if (path !== 'channelId' && !path.startsWith('options.schedule')) wxSchedulePreview();
    wxUpdateDirty();
}

function wxSetDays(days) {
    wx.draft.options.schedule.days = [...days].sort((a, b) => a - b);
    document.querySelectorAll('#wx-form [data-day]').forEach((btn) => {
        const on = wx.draft.options.schedule.days.includes(Number(btn.dataset.day));
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', String(on));
    });
    wxAfterChange('options.schedule.days');
}

function wxToggleField(key, on) {
    const fields = wx.draft.options.embed.fields.filter((k) => k !== key);
    if (on) fields.push(key);
    wx.draft.options.embed.fields = fields;
    wxRenderForm();
    wxAfterChange('options.embed.fields');
}

function wxMoveField(key, dir) {
    const fields = wx.draft.options.embed.fields;
    const from = fields.indexOf(key);
    const to = from + dir;
    if (from === -1 || to < 0 || to >= fields.length) return;
    [fields[from], fields[to]] = [fields[to], fields[from]];
    wxRenderForm();
    wxAfterChange('options.embed.fields');
}

// ==========================================
// ค้นหา / เลือกสถานที่
// ==========================================
async function wxSearchPlaces() {
    const input = document.getElementById('wx-place-query');
    const query = input.value.trim();
    if (!query) return input.focus();
    const btn = document.getElementById('wx-place-search');
    const box = document.getElementById('wx-places');
    btn.disabled = true;
    box.innerHTML = '<p class="wc-empty-text">กำลังค้นหา...</p>';
    try {
        wx.places = await wxApi('GET', `/api/weather/locations?q=${encodeURIComponent(query)}`);
        wxRenderForm();
        document.getElementById('wx-place-query').value = query;
        if (!wx.places.length) {
            document.getElementById('wx-places').innerHTML = '<p class="wc-empty-text">ไม่พบสถานที่นี้ — ลองพิมพ์ชื่อภาษาอังกฤษ หรือวางพิกัดแทน</p>';
        }
    } catch (err) {
        box.innerHTML = '';
        wxError('ค้นหาสถานที่ไม่สำเร็จ', err);
    } finally {
        const again = document.getElementById('wx-place-search');
        if (again) again.disabled = false;
    }
}

function wxPickPlace(index) {
    const place = wx.places[index];
    if (!place) return;
    wx.draft.options.location = {
        name: place.name,
        lat: Math.round(place.lat * 1e4) / 1e4,
        lon: Math.round(place.lon * 1e4) / 1e4,
        country: place.country || '',
    };
    wx.places = [];
    wxRenderForm();
    wxAfterChange('options.location');
    wxToast('success', `เลือก "${place.name}" แล้ว`, 'อย่าลืมกดบันทึก');
}

// ==========================================
// ตัวอย่าง: embed จาก server แสดงแบบ Discord
// ==========================================
function wxSchedulePreview(delay = WX_PREVIEW_DELAY) {
    if (!wx.draft) return;
    clearTimeout(wx.previewTimer);
    wx.previewTimer = setTimeout(wxRequestPreview, delay);
}

async function wxRequestPreview() {
    const seq = ++wx.previewSeq;
    const status = document.getElementById('wx-preview-status');
    const box = document.querySelector('#wx-content .discord-preview');
    box.classList.add('wx-rendering');
    try {
        const data = await wxApi('POST', '/api/weather/preview', { content: wx.draft.content, options: wx.draft.options });
        // ผู้ใช้แก้ค่าต่อระหว่างรอ → ทิ้งผลลัพธ์เก่า
        if (seq !== wx.previewSeq) return;
        wxRenderPreview(data);
        status.classList.add('hidden');
        document.getElementById('wx-fetched').textContent = `(ข้อมูล ณ ${new Date(data.fetchedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.)`;
    } catch (err) {
        if (seq !== wx.previewSeq) return;
        status.textContent = `สร้างตัวอย่างไม่สำเร็จ: ${err.message}`;
        status.classList.remove('hidden');
    } finally {
        if (seq === wx.previewSeq) box.classList.remove('wx-rendering');
    }
}

// Markdown ของ Discord + แท็กยศ / ห้อง ที่พิมพ์ไว้เอง แสดงเป็นชื่อแบบใน Discord
function wxMarkdown(text) {
    const mention = (label) => `<span class="wc-mention">${escapeHtml(label)}</span>`;
    const html = typeof renderDiscordMarkdown === 'function' ? renderDiscordMarkdown(text) : escapeHtml(text).replace(/\n/g, '<br>');
    return html
        .replace(/&lt;@&amp;(\d+)&gt;/g, (m, id) => mention(`@${wx.roles.find((r) => r.id === id)?.name || 'ยศ'}`))
        .replace(/&lt;#(\d+)&gt;/g, (m, id) => mention(`#${wx.channels.find((ch) => ch.id === id)?.name || 'ห้อง'}`))
        .replace(/&lt;@!?(\d+)&gt;/g, () => mention('@ผู้ใช้'));
}

function wxRenderPreview({ content, embed, image }) {
    document.getElementById('wx-preview-time').textContent =
        `วันนี้ ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;

    const msg = document.getElementById('wx-msg-content');
    msg.classList.toggle('hidden', !content);
    msg.innerHTML = content ? wxMarkdown(content) : '';

    const el = document.getElementById('wx-embed');
    el.style.borderLeftColor = `#${(embed.color ?? 0).toString(16).padStart(6, '0')}`;
    const title = embed.title
        ? (embed.url
            ? `<a class="discord-embed-title wx-embed-link" href="${escapeHtml(embed.url)}" target="_blank" rel="noopener">${escapeHtml(embed.title)}</a>`
            : `<div class="discord-embed-title">${escapeHtml(embed.title)}</div>`)
        : '';
    const fields = (embed.fields || []).map((f) => `
        <div class="wx-embed-field">
            <div class="wx-embed-field-name">${wxMarkdown(f.name)}</div>
            <div class="wx-embed-field-value">${wxMarkdown(f.value)}</div>
        </div>`).join('');
    const footerParts = [
        embed.footer?.text ? escapeHtml(embed.footer.text) : '',
        embed.timestamp ? `วันนี้ เวลา ${new Date(embed.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` : '',
    ].filter(Boolean);

    el.classList.toggle('wx-has-thumb', Boolean(embed.thumbnail));
    el.innerHTML = `
        ${embed.thumbnail ? `<img class="wx-embed-thumb" src="${escapeHtml(embed.thumbnail.url)}" alt="">` : ''}
        ${title}
        ${embed.description ? `<div class="discord-embed-desc">${wxMarkdown(embed.description)}</div>` : ''}
        ${fields ? `<div class="wx-embed-fields">${fields}</div>` : ''}
        ${image ? `<img class="discord-embed-image" src="${image}" alt="กราฟพยากรณ์อากาศ">` : ''}
        ${footerParts.length ? `<div class="discord-embed-footer"><span>${footerParts.join(' • ')}</span></div>` : ''}`;
}

// ==========================================
// บันทึก / ยกเลิก / เปิด-ปิด / ส่งทดสอบ
// ==========================================
async function wxSave() {
    if (!wxIsDirty()) return;
    const btn = document.getElementById('wx-save-btn');
    btn.disabled = true;
    try {
        const data = await wxApi('POST', '/api/weather/settings', wxPick(wx.draft));
        wxLoadSettings(data.settings);
        if (data.warning) {
            Swal.fire({ icon: 'warning', title: 'บันทึกแล้ว แต่ยังส่งรายงานไม่ได้', text: data.warning, confirmButtonColor: '#6366f1' });
        } else {
            wxToast('success', 'บันทึกการตั้งค่าแล้ว');
        }
    } catch (err) {
        wxError('บันทึกไม่สำเร็จ', err);
    } finally {
        wxUpdateDirty();
    }
}

function wxRevert() {
    if (!wx.saved) return;
    wx.draft = wxClone(wx.saved);
    wxRenderForm();
    wxUpdateDirty();
    wxSchedulePreview(0);
}

// สวิตช์บันทึกทันที — ใช้ค่าที่บันทึกไว้ (ไม่รวมการแก้ไขที่ยังค้างอยู่)
async function wxToggleEnabled(input) {
    const enabled = input.checked;
    if (enabled && !wx.saved.channelId) {
        input.checked = false;
        return wxError('ยังเปิดใช้งานไม่ได้', new Error('เลือกห้องที่จะส่งแล้วกด "บันทึก" ก่อนเปิดใช้งาน'));
    }
    try {
        const data = await wxApi('POST', '/api/weather/settings', { enabled });
        // เก็บการแก้ไขที่ค้างอยู่ไว้ อัปเดตแค่สถานะเปิด/ปิดและเวลาส่งครั้งถัดไป
        Object.assign(wx.saved, { enabled: data.settings.enabled, nextRunAt: data.settings.nextRunAt });
        wx.draft.enabled = data.settings.enabled;
        wxRenderHead();
        if (data.warning) {
            Swal.fire({ icon: 'warning', title: 'เปิดใช้งานแล้ว แต่ยังส่งรายงานไม่ได้', text: data.warning, confirmButtonColor: '#6366f1' });
        } else {
            wxToast('success', enabled ? 'เปิดรายงานสภาพอากาศแล้ว' : 'ปิดรายงานสภาพอากาศแล้ว');
        }
    } catch (err) {
        input.checked = !enabled;
        wxError('เปลี่ยนสถานะไม่สำเร็จ', err);
    }
}

async function wxTestSend() {
    if (!wx.draft.channelId) return wxError('ยังส่งทดสอบไม่ได้', new Error('กรุณาเลือกห้องที่จะส่งในหมวด "เวลา & ห้อง" ก่อน'));
    const { isConfirmed } = await Swal.fire({
        title: escapeHtml(`ส่งรายงานทดสอบเข้า ${wxChannelName(wx.draft.channelId)}?`),
        text: 'ใช้ค่าที่กำลังแก้อยู่ตอนนี้ (แม้ยังไม่บันทึก) — สมาชิกในห้องนั้นจะเห็นข้อความนี้',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ส่งทดสอบ',
        cancelButtonText: 'ยกเลิก',
    });
    if (!isConfirmed) return;

    const btn = document.getElementById('wx-test-btn');
    btn.disabled = true;
    try {
        const data = await wxApi('POST', '/api/weather/test', wxPick(wx.draft));
        wxToast('success', 'ส่งทดสอบแล้ว', data.message);
    } catch (err) {
        wxError('ส่งทดสอบไม่สำเร็จ', err);
    } finally {
        btn.disabled = false;
    }
}

// ==========================================
// ผูก event (ครั้งเดียว) — ฟอร์มถูกสร้างใหม่บ่อย จึงใช้ event delegation ที่กล่องแม่
// ==========================================
function wxBindStaticEvents() {
    if (wx.bound) return;
    wx.bound = true;
    const form = document.getElementById('wx-form');

    form.addEventListener('input', (e) => {
        const el = e.target.closest('[data-path]');
        if (el && el.type !== 'checkbox' && el.tagName !== 'SELECT') wxApplyInput(el);
    });

    form.addEventListener('change', (e) => {
        const el = e.target;
        if (el.matches('[data-field-toggle]')) return wxToggleField(el.dataset.fieldToggle, el.checked);
        if (el.id === 'wx-role-insert' && el.value) {
            const field = document.getElementById('wx-content-input');
            const tag = `<@&${el.value}>`;
            field.value = field.value ? `${field.value.replace(/\s+$/, '')} ${tag}` : tag;
            el.value = '';
            return field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (el.matches('[data-path]') && (el.type === 'checkbox' || el.tagName === 'SELECT')) wxApplyInput(el);
    });

    form.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-set-path]');
        if (seg) {
            const { setPath, setValue, setType } = seg.dataset;
            wxSet(setPath, setType === 'int' ? Number(setValue) : setValue);
            seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === seg));
            return wxAfterChange(setPath);
        }

        const day = e.target.closest('[data-day]');
        if (day) {
            const value = Number(day.dataset.day);
            const days = new Set(wx.draft.options.schedule.days);
            days.has(value) ? days.delete(value) : days.add(value);
            return wxSetDays(days);
        }

        const preset = e.target.closest('[data-days]');
        if (preset) {
            const sets = { all: [0, 1, 2, 3, 4, 5, 6], weekdays: [1, 2, 3, 4, 5], weekend: [0, 6] };
            return wxSetDays(sets[preset.dataset.days]);
        }

        const move = e.target.closest('[data-field-move]');
        if (move) return wxMoveField(move.dataset.fieldMove, Number(move.dataset.dir));

        const chip = e.target.closest('[data-insert]');
        if (chip) {
            const field = form.querySelector(`[data-path="${chip.dataset.target}"]`);
            if (!field) return;
            const start = field.selectionStart ?? field.value.length;
            const end = field.selectionEnd ?? field.value.length;
            field.value = field.value.slice(0, start) + chip.dataset.insert + field.value.slice(end);
            field.focus();
            field.setSelectionRange(start + chip.dataset.insert.length, start + chip.dataset.insert.length);
            return field.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (e.target.closest('#wx-place-search')) return wxSearchPlaces();
        const pick = e.target.closest('[data-pick]');
        if (pick) wxPickPlace(Number(pick.dataset.pick));
    });

    form.addEventListener('keydown', (e) => {
        if (e.target.id === 'wx-place-query' && e.key === 'Enter') {
            e.preventDefault();
            wxSearchPlaces();
        }
    });

    document.getElementById('wx-sections').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-section]');
        if (!btn || btn.dataset.section === wx.section) return;
        wx.section = btn.dataset.section;
        wxRenderHead();
        wxRenderForm();
    });

    document.getElementById('wx-enabled').addEventListener('change', (e) => wxToggleEnabled(e.target));
    document.getElementById('wx-save-btn').addEventListener('click', wxSave);
    document.getElementById('wx-revert-btn').addEventListener('click', wxRevert);
    document.getElementById('wx-test-btn').addEventListener('click', wxTestSend);

    // Ctrl/⌘ + S = บันทึก (เฉพาะตอนเปิดแท็บนี้อยู่)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !document.getElementById('weather-tab').classList.contains('hidden')) {
            e.preventDefault();
            wxSave();
        }
    });

    window.addEventListener('beforeunload', (e) => {
        if (!wxIsDirty()) return;
        e.preventDefault();
        e.returnValue = '';
    });
}
