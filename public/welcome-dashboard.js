// ==========================================
// 🎉 WELCOME ANNOUNCEMENT — หน้าแก้ไขการ์ดต้อนรับแบบรูปภาพ (ADMIN)
// - รายการการ์ด: สร้าง / คัดลอก / ลบ / เปิด-ปิด (สวิตช์เปิด-ปิดบันทึกทันที)
// - ตัวแก้ไข 4 หมวด: ทั่วไป / พื้นหลัง / รูปโปรไฟล์ / ข้อความบนรูป — แก้แล้วกด "บันทึก" (Ctrl/⌘ + S)
// - รูปตัวอย่างวาดที่ server ด้วยโค้ดเดียวกับตอนส่งจริง และลากรูปโปรไฟล์/ข้อความบนรูปเพื่อย้ายได้
// ==========================================

const WC_SIZE_PRESETS = [
    { w: 1024, h: 450, label: '1024 × 450 — แนะนำ' },
    { w: 1200, h: 500, label: '1200 × 500 — แบนเนอร์กว้าง' },
    { w: 1000, h: 350, label: '1000 × 350 — แบนเนอร์เตี้ย' },
    { w: 800, h: 800, label: '800 × 800 — จัตุรัส' },
];
const WC_FIT_LABELS = { cover: 'เต็มกรอบ (ครอป)', contain: 'เห็นทั้งรูป', stretch: 'ยืดให้เต็ม' };
const WC_SHAPE_LABELS = { circle: 'วงกลม', rounded: 'มุมโค้ง', square: 'สี่เหลี่ยม' };
const WC_ALIGN_LABELS = { left: 'ชิดซ้าย', center: 'กึ่งกลาง', right: 'ชิดขวา' };
const WC_HEX = /^#[0-9a-fA-F]{6}$/;
const WC_PREVIEW_DELAY = 250;
// ฟิลด์ที่ต้องกดบันทึก (enabled แยกไปบันทึกทันทีจากสวิตช์)
const WC_DRAFT_FIELDS = ['name', 'channelId', 'content', 'design', 'backgroundId'];
const WC_MENTION_TOKEN = 'WCMENTIONTOKEN';

const wc = {
    loaded: false,
    loading: null,
    meta: null,
    cards: [],
    assets: [],
    channels: [],
    roles: [],
    selectedId: null,
    saved: null,       // การ์ดตามที่อยู่ในฐานข้อมูล — ใช้เทียบว่ามีการแก้ไขค้างอยู่ไหม
    draft: null,       // ค่าที่กำลังแก้
    section: 'general',
    openText: 0,       // ชั้นข้อความที่กางอยู่ (-1 = พับหมด)
    sampleUserId: null,
    vars: null,        // ค่าของตัวแปร ({user} ...) ของสมาชิกตัวอย่าง ได้มาจาก server พร้อมรูป
    previewTimer: null,
    previewSeq: 0,
    picker: null,
    bound: false,
};

const wcClone = (value) => JSON.parse(JSON.stringify(value));
const wcPick = (card) => Object.fromEntries(WC_DRAFT_FIELDS.map((key) => [key, card[key]]));

async function wcApi(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function wcToast(icon, title, text) {
    Swal.fire({ toast: true, position: 'top-end', icon, title, text, showConfirmButton: false, timer: 2500, timerProgressBar: true });
}

function wcError(title, err) {
    Swal.fire({ icon: 'error', title, text: err.message || String(err), confirmButtonColor: '#6366f1' });
}

async function wcConfirm(title, text, confirmButtonText, danger = true) {
    const result = await Swal.fire({
        title: escapeHtml(title),
        text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: danger ? '#ef4444' : '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText,
        cancelButtonText: 'ยกเลิก',
    });
    return result.isConfirmed;
}

const wcIsDirty = () => Boolean(wc.draft && wc.saved) && JSON.stringify(wcPick(wc.draft)) !== JSON.stringify(wcPick(wc.saved));

// จำนวนการ์ด (ที่บันทึกแล้ว) ที่ใช้รูปนี้เป็นพื้นหลัง — นับจากรายการในหน้าเว็บ จะได้ตรงเสมอหลังบันทึก/ลบการ์ด
const wcAssetUsage = (assetId) => wc.cards.filter((card) => card.backgroundId === assetId).length;

function wcFormatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

// ==========================================
// โหลดข้อมูล — เรียกจาก switchTab ตอนเปิดแท็บ Welcome ครั้งแรก
// ==========================================
function loadWelcomeTab() {
    if (!wc.loading) wc.loading = wcInit();
    else if (wc.loaded) wcSchedulePreview(0);
    return wc.loading;
}

async function wcInit() {
    try {
        const [meta, cards, assets, channelsRes, rolesRes] = await Promise.all([
            wcApi('GET', '/api/welcome/meta'),
            wcApi('GET', '/api/welcome/cards'),
            wcApi('GET', '/api/welcome/assets'),
            fetch('/api/guild-channels'),
            fetch('/api/guild-roles'),
        ]);
        wc.meta = meta;
        wc.cards = cards;
        wc.assets = assets;
        // บอทยังไม่ออนไลน์ → ยังแก้การ์ดได้ แค่รายชื่อห้องว่าง
        wc.channels = channelsRes.ok ? (await channelsRes.json()).filter((ch) => ch.sendable) : [];
        wc.roles = rolesRes.ok ? await rolesRes.json() : [];

        if (meta.bot) {
            document.getElementById('wc-bot-avatar').src = meta.bot.avatar;
            document.getElementById('wc-bot-name').textContent = meta.bot.name;
        }

        wcBindStaticEvents();
        wc.loaded = true;
        document.getElementById('wc-loading').classList.add('hidden');
        document.getElementById('wc-content').classList.remove('hidden');

        wcRenderList();
        if (wc.cards.length) wcSelect(wc.cards[0].id, { force: true });
        else wcShowEditor(false);
    } catch (err) {
        console.error('Error loading welcome tab:', err);
        wc.loading = null; // เปิดแท็บใหม่อีกครั้งเพื่อลองโหลดซ้ำได้
        document.getElementById('wc-loading').innerHTML = `<p class="cell-error">โหลดข้อมูล Welcome ไม่สำเร็จ: ${escapeHtml(err.message)}</p>`;
    }
}

// ==========================================
// รายการการ์ด
// ==========================================
function wcChannelName(channelId) {
    if (!channelId) return null;
    const channel = wc.channels.find((ch) => ch.id === channelId);
    return channel ? `#${channel.name}` : `ID: ${channelId}`;
}

function wcRenderList() {
    const list = document.getElementById('wc-card-list');
    list.innerHTML = wc.cards.map((card) => {
        const channel = wcChannelName(card.channelId);
        return `
            <div class="wc-card-item ${card.id === wc.selectedId ? 'active' : ''}" data-card="${card.id}" role="button" tabindex="0">
                <div class="wc-card-main">
                    <strong class="wc-card-name">${escapeHtml(card.name)}</strong>
                    <span class="wc-card-meta">${channel ? escapeHtml(channel) : '<span class="wc-warn-text">ยังไม่ได้เลือกห้อง</span>'}</span>
                </div>
                <span class="wc-card-state ${card.enabled ? 'on' : ''}">${card.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
                <label class="switch" title="เปิด/ปิดการ์ดนี้ (บันทึกทันที)">
                    <input type="checkbox" data-card-toggle="${card.id}" ${card.enabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>`;
    }).join('');
    document.getElementById('wc-empty').classList.toggle('hidden', wc.cards.length > 0);
}

function wcShowEditor(show) {
    document.getElementById('wc-editor').classList.toggle('hidden', !show);
    document.getElementById('wc-empty').classList.toggle('hidden', show || wc.cards.length > 0);
}

async function wcSelect(id, { force = false } = {}) {
    if (!force && id === wc.selectedId) return;
    if (!force && wcIsDirty() && !(await wcConfirm('ทิ้งการแก้ไขที่ยังไม่บันทึก?', `การ์ด "${wc.draft.name}" มีการแก้ไขที่ยังไม่ได้กดบันทึก`, 'ทิ้งการแก้ไข'))) return;

    const card = wc.cards.find((c) => c.id === id);
    if (!card) return;
    wc.selectedId = id;
    wc.saved = wcClone(card);
    wc.draft = wcClone(card);
    wc.openText = card.design.texts.length ? 0 : -1;

    wcRenderList();
    wcShowEditor(true);
    wcRenderEditorHead();
    wcRenderForm();
    wcRenderHandles();
    wcRenderMessage();
    wcUpdateDirty();
    wcSchedulePreview(0);
}

function wcRenderEditorHead() {
    document.getElementById('wc-editor-name').textContent = wc.draft.name;
    document.getElementById('wc-enabled').checked = wc.draft.enabled;
    document.querySelectorAll('#wc-sections [data-section]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.section === wc.section);
    });
}

function wcUpdateDirty() {
    const dirty = wcIsDirty();
    document.getElementById('wc-dirty').classList.toggle('hidden', !dirty);
    document.getElementById('wc-save-btn').disabled = !dirty;
    document.getElementById('wc-revert-btn').disabled = !dirty;
}

// ==========================================
// ตัวช่วยสร้างฟอร์ม — ทุกช่องมี data-path ชี้ไปที่ค่าใน wc.draft (เช่น design.texts.0.size)
// ช่องที่ path เดียวกัน (slider + ช่องตัวเลข) จะถูก sync ให้ตรงกันเอง
// ==========================================
function wcGet(path) {
    return path.split('.').reduce((obj, key) => (obj == null ? obj : obj[key]), wc.draft);
}

function wcSet(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((obj, key) => obj[key], wc.draft);
    parent[last] = value;
}

function wcDisplayValue(type, value) {
    return type === 'percent' ? Math.round(value * 100) : value;
}

function wcRange(label, path, min, max, { step = 1, type = 'int', unit = 'px', extra = '' } = {}) {
    const shown = wcDisplayValue(type, wcGet(path));
    return `
        <div class="wc-range">
            <label>${label}</label>
            <input type="range" min="${min}" max="${max}" step="${step}" value="${shown}" data-path="${path}" data-type="${type}">
            <div class="wc-range-num">
                <input type="number" class="input wc-num" min="${min}" max="${max}" step="${step}" value="${shown}" data-path="${path}" data-type="${type}">
                <span>${unit}</span>
            </div>
            ${extra}
        </div>`;
}

function wcColor(label, path) {
    const value = wcGet(path);
    return `
        <div class="field">
            <label>${label}</label>
            <div class="color-field">
                <input type="color" class="color-swatch" value="${escapeHtml(value)}" data-path="${path}" data-type="color">
                <input type="text" class="input" value="${escapeHtml(value.toUpperCase())}" maxlength="7" spellcheck="false" data-path="${path}" data-type="color">
            </div>
        </div>`;
}

function wcSegmented(path, labels) {
    const current = wcGet(path);
    return `
        <div class="segmented wc-seg">
            ${Object.entries(labels).map(([value, text]) => `
                <button type="button" class="${value === current ? 'active' : ''}" data-set-path="${path}" data-set-value="${value}">${text}</button>`).join('')}
        </div>`;
}

function wcSwitch(label, path) {
    return `
        <label class="toggle-row">
            <span>${label}</span>
            <span class="switch">
                <input type="checkbox" data-path="${path}" data-type="bool" ${wcGet(path) ? 'checked' : ''}>
                <span class="slider"></span>
            </span>
        </label>`;
}

function wcChips(targetPath) {
    return `
        <div class="wc-chips">
            ${wc.meta.placeholders.map((p) => `
                <button type="button" class="wc-chip" data-insert="{${p.key}}" data-target="${targetPath}" title="${escapeHtml(p.label)}">{${p.key}}</button>`).join('')}
        </div>`;
}

function wcChannelOptions(selectedId) {
    let html = '<option value="">— เลือกห้องที่จะส่ง —</option>';
    const byCategory = {};
    wc.channels.forEach((ch) => { (byCategory[ch.category] ||= []).push(ch); });
    Object.entries(byCategory).forEach(([category, channels]) => {
        html += `<optgroup label="${escapeHtml(category)}">`;
        channels.forEach((ch) => {
            html += `<option value="${escapeHtml(ch.id)}" ${ch.id === selectedId ? 'selected' : ''}>#${escapeHtml(ch.name)}</option>`;
        });
        html += '</optgroup>';
    });
    // ห้องที่ตั้งไว้แต่หาไม่เจอแล้ว (ถูกลบ / บอทมองไม่เห็น) — ยังคงค่าไว้ ไม่ให้หายไปเงียบๆ
    if (selectedId && !wc.channels.some((ch) => ch.id === selectedId)) {
        html += `<option value="${escapeHtml(selectedId)}" selected>ID: ${escapeHtml(selectedId)} (ไม่พบห้องนี้)</option>`;
    }
    return html;
}

// ==========================================
// ฟอร์มแต่ละหมวด
// ==========================================
function wcRenderForm() {
    const form = document.getElementById('wc-form');
    const builders = { general: wcFormGeneral, background: wcFormBackground, avatar: wcFormAvatar, texts: wcFormTexts };
    form.innerHTML = (builders[wc.section] || wcFormGeneral)();
}

function wcFormGeneral() {
    const { limits } = wc.meta;
    return `
        <div class="field">
            <label for="wc-name">ชื่อการ์ด</label>
            <input type="text" id="wc-name" class="input" maxlength="${limits.maxNameLength}" value="${escapeHtml(wc.draft.name)}" data-path="name" data-type="text">
            <span class="field-hint">ใช้แยกการ์ดในหน้านี้เท่านั้น สมาชิกไม่เห็น</span>
        </div>

        <div class="field">
            <label for="wc-channel">ห้องที่จะส่ง</label>
            <select id="wc-channel" class="input-select" data-path="channelId" data-type="text">${wcChannelOptions(wc.draft.channelId)}</select>
            <span class="field-hint">${wc.channels.length ? 'บอทต้องมีสิทธิ์ดูห้อง ส่งข้อความ และแนบไฟล์ในห้องนี้' : 'บอทยังไม่ออนไลน์ จึงยังโหลดรายชื่อห้องไม่ได้'}</span>
        </div>

        <div class="field">
            <label for="wc-content-input">ข้อความที่ส่งคู่กับรูป</label>
            <textarea id="wc-content-input" class="input" rows="4" maxlength="${limits.maxContentLength}" placeholder="เว้นว่างไว้ = ส่งแค่รูป" data-path="content" data-type="text">${escapeHtml(wc.draft.content)}</textarea>
            ${wcChips('content')}
            <span class="field-hint">รองรับ Markdown ของ Discord · {mention} จะแท็กสมาชิกใหม่จริง · <span id="wc-content-count">${wc.draft.content.length}</span>/${limits.maxContentLength}</span>
        </div>

        <div class="wc-help">
            <strong>ตัวแปรที่ใช้ได้</strong>
            <ul>${wc.meta.placeholders.map((p) => `<li><code>{${p.key}}</code> ${escapeHtml(p.label)}</li>`).join('')}</ul>
        </div>`;
}

function wcFormBackground() {
    const { design } = wc.draft;
    const preset = WC_SIZE_PRESETS.find((p) => p.w === design.width && p.h === design.height);
    const tiles = wc.assets.map((asset) => {
        const usedBy = wcAssetUsage(asset.id);
        return `
        <div class="wc-tile ${asset.id === wc.draft.backgroundId ? 'selected' : ''}" data-asset="${asset.id}" role="button" tabindex="0" title="${escapeHtml(asset.name)}">
            <img src="/api/welcome/assets/${asset.id}/image" alt="" loading="lazy">
            <div class="wc-tile-info">
                <span>${escapeHtml(asset.name)}</span>
                <small>${asset.width}×${asset.height} · ${wcFormatBytes(asset.size)}${usedBy ? ` · ใช้ ${usedBy} การ์ด` : ''}</small>
            </div>
            <div class="wc-tile-actions">
                <button type="button" class="wc-icon-btn" data-asset-action="rename" data-id="${asset.id}" title="เปลี่ยนชื่อ">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                </button>
                <button type="button" class="wc-icon-btn wc-icon-danger" data-asset-action="delete" data-id="${asset.id}" title="ลบออกจากคลัง">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                </button>
            </div>
        </div>`;
    }).join('');

    return `
        <div class="field">
            <label for="wc-size-preset">ขนาดรูป (กว้าง × สูง พิกเซล)</label>
            <select id="wc-size-preset" class="input-select" data-canvas-preset>
                ${WC_SIZE_PRESETS.map((p) => `<option value="${p.w}x${p.h}" ${preset === p ? 'selected' : ''}>${p.label}</option>`).join('')}
                <option value="custom" ${preset ? '' : 'selected'}>กำหนดเอง</option>
            </select>
            <div class="wc-size-row">
                <input type="number" class="input" min="${wc.meta.limits.minWidth}" max="${wc.meta.limits.maxWidth}" value="${design.width}" data-canvas="width" aria-label="ความกว้าง">
                <span>×</span>
                <input type="number" class="input" min="${wc.meta.limits.minHeight}" max="${wc.meta.limits.maxHeight}" value="${design.height}" data-canvas="height" aria-label="ความสูง">
            </div>
            <span class="field-hint">เปลี่ยนขนาดแล้วตำแหน่งรูปโปรไฟล์และข้อความจะถูกย่อ/ขยายตามให้เอง</span>
        </div>

        <div class="field">
            <label>รูปพื้นหลัง</label>
            <div class="wc-gallery">
                <button type="button" class="wc-tile wc-tile-none ${wc.draft.backgroundId ? '' : 'selected'}" data-asset="">
                    <span class="wc-tile-swatch" style="background:${escapeHtml(design.background.color)}"></span>
                    <span>ไม่ใช้รูป</span>
                    <small>ใช้สีพื้นอย่างเดียว</small>
                </button>
                ${tiles}
                <label class="wc-tile wc-tile-upload">
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" id="wc-upload-input" hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5M12 3v12"/></svg>
                    <span>อัปโหลดรูป</span>
                    <small>PNG · JPG · WEBP · GIF ไม่เกิน ${wcFormatBytes(wc.meta.limits.maxUploadBytes)}</small>
                </label>
            </div>
            <span class="field-hint">รูปในคลังใช้ร่วมกันได้ทุกการ์ด — แนะนำรูปแนวนอนขนาดใกล้เคียงกับขนาดการ์ด</span>
        </div>

        <div class="field">
            <label>การวางรูป</label>
            ${wcSegmented('design.background.fit', WC_FIT_LABELS)}
        </div>

        ${wcRange('ความเบลอของรูป', 'design.background.blur', 0, 30)}

        <div class="field-row">
            ${wcColor('สีพื้น', 'design.background.color')}
            ${wcColor('สีทับรูป (ช่วยให้อ่านตัวหนังสือง่ายขึ้น)', 'design.background.overlayColor')}
        </div>
        ${wcRange('ความเข้มของสีทับ', 'design.background.overlayOpacity', 0, 100, { type: 'percent', unit: '%' })}`;
}

function wcCenterButton(path, value, label = 'กึ่งกลาง') {
    return `<button type="button" class="wc-mini-btn" data-center-path="${path}" data-center-value="${value}">${label}</button>`;
}

function wcFormAvatar() {
    const { design } = wc.draft;
    const base = 'design.avatar';
    return `
        ${wcSwitch('แสดงรูปโปรไฟล์ของสมาชิก', `${base}.visible`)}

        <div class="field stack-top">
            <label>รูปทรง</label>
            ${wcSegmented(`${base}.shape`, WC_SHAPE_LABELS)}
        </div>

        ${wcRange('ขนาด', `${base}.size`, 16, Math.min(design.width, design.height))}
        ${wcRange('ตำแหน่งแนวนอน (X)', `${base}.x`, 0, design.width, { extra: wcCenterButton(`${base}.x`, Math.round(design.width / 2)) })}
        ${wcRange('ตำแหน่งแนวตั้ง (Y)', `${base}.y`, 0, design.height, { extra: wcCenterButton(`${base}.y`, Math.round(design.height / 2)) })}
        ${wcRange('ความหนาของขอบ', `${base}.borderWidth`, 0, 40)}
        ${wcColor('สีขอบ', `${base}.borderColor`)}
        <p class="field-hint">ลากรูปโปรไฟล์บนรูปตัวอย่างเพื่อย้ายตำแหน่งได้เลย</p>`;
}

function wcLayerTitle(layer) {
    const text = layer.text.replace(/\s+/g, ' ').trim();
    return text || '(ข้อความว่าง)';
}

function wcFormTexts() {
    const { design } = wc.draft;
    const { fonts, weights, limits } = wc.meta;
    const count = design.texts.length;

    const layers = design.texts.map((layer, i) => {
        const base = `design.texts.${i}`;
        const open = i === wc.openText;
        return `
            <div class="wc-layer ${open ? 'open' : ''}" data-index="${i}">
                <div class="wc-layer-head">
                    <button type="button" class="wc-layer-toggle" data-layer-action="toggle" data-index="${i}" aria-expanded="${open}">
                        <span class="wc-layer-num">${i + 1}</span>
                        <span class="wc-layer-title">${escapeHtml(wcLayerTitle(layer))}</span>
                        <svg class="wc-layer-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <div class="wc-layer-actions">
                        <button type="button" class="wc-icon-btn" data-layer-action="up" data-index="${i}" title="เลื่อนขึ้น (วาดก่อน)" ${i === 0 ? 'disabled' : ''}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m18 15-6-6-6 6"/></svg>
                        </button>
                        <button type="button" class="wc-icon-btn" data-layer-action="down" data-index="${i}" title="เลื่อนลง (วาดทับ)" ${i === count - 1 ? 'disabled' : ''}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
                        </button>
                        <button type="button" class="wc-icon-btn" data-layer-action="copy" data-index="${i}" title="คัดลอก" ${count >= limits.maxTexts ? 'disabled' : ''}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        </button>
                        <button type="button" class="wc-icon-btn wc-icon-danger" data-layer-action="remove" data-index="${i}" title="ลบข้อความนี้">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
                        </button>
                    </div>
                </div>
                <div class="wc-layer-body">
                    <div class="field">
                        <label>ข้อความ</label>
                        <textarea class="input wc-layer-text" rows="2" maxlength="${limits.maxTextLength}" data-path="${base}.text" data-type="text">${escapeHtml(layer.text)}</textarea>
                        ${wcChips(`${base}.text`)}
                        <span class="field-hint">ขึ้นบรรทัดใหม่ได้ · ข้อความที่ยาวเกิน "ความกว้างสูงสุด" จะถูกย่อลงเอง</span>
                    </div>

                    <div class="field-row">
                        <div class="field">
                            <label>ฟอนต์</label>
                            <select class="input-select" data-path="${base}.font" data-type="text">
                                ${fonts.map((f) => `<option value="${f.id}" ${f.id === layer.font ? 'selected' : ''}>${escapeHtml(f.label)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="field">
                            <label>น้ำหนัก</label>
                            <select class="input-select" data-path="${base}.weight" data-type="int">
                                ${weights.map((w) => `<option value="${w.value}" ${w.value === layer.weight ? 'selected' : ''}>${escapeHtml(w.label)}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    ${wcRange('ขนาดตัวอักษร', `${base}.size`, 8, 200)}
                    ${wcColor('สีตัวอักษร', `${base}.color`)}

                    <div class="field">
                        <label>จัดแนว (นับจากจุดตำแหน่ง X)</label>
                        ${wcSegmented(`${base}.align`, WC_ALIGN_LABELS)}
                    </div>

                    ${wcRange('ตำแหน่งแนวนอน (X)', `${base}.x`, 0, design.width, { extra: wcCenterButton(`${base}.x`, Math.round(design.width / 2)) })}
                    ${wcRange('ตำแหน่งแนวตั้ง (Y)', `${base}.y`, 0, design.height)}
                    ${wcRange('ความกว้างสูงสุด (0 = ไม่จำกัด)', `${base}.maxWidth`, 0, design.width)}
                    ${wcRange('ระยะห่างตัวอักษร', `${base}.letterSpacing`, 0, 40)}
                    ${wcRange('ขอบตัวอักษร', `${base}.strokeWidth`, 0, 20)}
                    ${wcColor('สีขอบตัวอักษร', `${base}.strokeColor`)}
                    ${wcSwitch('เงาใต้ตัวอักษร', `${base}.shadow`)}
                </div>
            </div>`;
    }).join('');

    return `
        <p class="section-hint">ชั้นที่อยู่ล่างสุดในรายการจะถูกวาดทับชั้นบน · ลากจุดตัวเลขบนรูปตัวอย่างเพื่อย้ายข้อความ</p>
        <div class="wc-layers">${layers || '<p class="wc-empty-text">ยังไม่มีข้อความบนรูป</p>'}</div>
        <button type="button" class="btn btn-secondary btn-block stack-top" data-layer-action="add" ${count >= limits.maxTexts ? 'disabled' : ''}>
            + เพิ่มข้อความ (${count}/${limits.maxTexts})
        </button>`;
}

// ==========================================
// รับค่าจากฟอร์ม
// ==========================================
function wcParseInput(el) {
    const type = el.dataset.type;
    if (type === 'bool') return el.checked;
    if (type === 'text') return el.value;
    if (type === 'color') return WC_HEX.test(el.value.trim()) ? el.value.trim().toLowerCase() : undefined;

    let n = Number(el.value);
    if (el.value === '' || !Number.isFinite(n)) return undefined;
    // select ไม่มี min/max → ใช้ getAttribute (ได้ null) แทน el.min
    const min = el.getAttribute('min') !== null ? Number(el.getAttribute('min')) : -Infinity;
    const max = el.getAttribute('max') !== null ? Number(el.getAttribute('max')) : Infinity;
    n = Math.min(max, Math.max(min, n));
    return type === 'percent' ? Math.round(n) / 100 : Math.round(n);
}

// ให้ทุกช่องที่ผูกกับ path เดียวกันแสดงค่าล่าสุด (ยกเว้นช่องที่ผู้ใช้กำลังพิมพ์อยู่)
function wcSyncInputs(path, value, except = null) {
    document.querySelectorAll(`#wc-form [data-path="${path}"]`).forEach((el) => {
        if (el === except) return;
        if (el.dataset.type === 'bool') el.checked = Boolean(value);
        else if (el.dataset.type === 'color') el.value = el.type === 'color' ? value : value.toUpperCase();
        else el.value = wcDisplayValue(el.dataset.type, value);
    });
}

function wcApplyInput(el) {
    const path = el.dataset.path;
    const value = wcParseInput(el);
    if (value === undefined) {
        // ช่องตัวเลขที่ลบจนว่าง → คืนค่าเดิม
        if (el.classList.contains('wc-num')) el.value = wcDisplayValue(el.dataset.type, wcGet(path));
        return;
    }
    wcSet(path, value);
    // ช่องตัวเลขอาจถูกบีบค่าให้อยู่ในช่วง → เขียนค่าที่ใช้จริงกลับลงไป
    wcSyncInputs(path, value, el.classList.contains('wc-num') ? null : el);
    wcAfterChange(path);
}

function wcAfterChange(path) {
    if (path === 'name') {
        document.getElementById('wc-editor-name').textContent = wc.draft.name || '(ไม่มีชื่อ)';
    } else if (path === 'content') {
        const counter = document.getElementById('wc-content-count');
        if (counter) counter.textContent = wc.draft.content.length;
        wcRenderMessage();
    } else if (path.startsWith('design.') || path === 'backgroundId') {
        const textMatch = path.match(/^design\.texts\.(\d+)\.text$/);
        if (textMatch) {
            const title = document.querySelector(`.wc-layer[data-index="${textMatch[1]}"] .wc-layer-title`);
            if (title) title.textContent = wcLayerTitle(wc.draft.design.texts[textMatch[1]]);
        }
        if (path === 'design.background.color') {
            const swatch = document.querySelector('.wc-tile-swatch');
            if (swatch) swatch.style.background = wc.draft.design.background.color;
        }
        wcPositionHandles();
        wcSchedulePreview();
    }
    wcUpdateDirty();
}

// เปลี่ยนขนาดรูป — ย่อ/ขยายตำแหน่งและขนาดขององค์ประกอบตามสัดส่วน จะได้ไม่หลุดขอบ
function wcSetCanvasSize(width, height) {
    const { limits } = wc.meta;
    const design = wc.draft.design;
    const w = Math.min(limits.maxWidth, Math.max(limits.minWidth, Math.round(width) || design.width));
    const h = Math.min(limits.maxHeight, Math.max(limits.minHeight, Math.round(height) || design.height));
    const sx = w / design.width;
    const sy = h / design.height;
    const s = Math.min(sx, sy);

    design.avatar.x = Math.round(design.avatar.x * sx);
    design.avatar.y = Math.round(design.avatar.y * sy);
    design.avatar.size = Math.max(16, Math.min(Math.min(w, h), Math.round(design.avatar.size * s)));
    design.avatar.borderWidth = Math.round(design.avatar.borderWidth * s);
    design.texts.forEach((t) => {
        t.x = Math.round(t.x * sx);
        t.y = Math.round(t.y * sy);
        t.size = Math.max(8, Math.min(200, Math.round(t.size * s)));
        t.maxWidth = Math.min(w, Math.round(t.maxWidth * sx));
        t.letterSpacing = Math.round(t.letterSpacing * s);
        t.strokeWidth = Math.round(t.strokeWidth * s);
    });
    design.width = w;
    design.height = h;

    wcRenderForm();
    wcRenderHandles();
    wcSchedulePreview(0);
    wcUpdateDirty();
}

// ==========================================
// ชั้นข้อความ: เพิ่ม / ลบ / สลับลำดับ / คัดลอก / พับ-กาง
// ==========================================
function wcLayerAction(action, index) {
    const texts = wc.draft.design.texts;
    const { limits } = wc.meta;

    if (action === 'toggle') {
        wc.openText = wc.openText === index ? -1 : index;
        document.querySelectorAll('.wc-layer').forEach((el) => {
            const open = Number(el.dataset.index) === wc.openText;
            el.classList.toggle('open', open);
            el.querySelector('.wc-layer-toggle').setAttribute('aria-expanded', String(open));
        });
        return;
    }

    if (action === 'add') {
        if (texts.length >= limits.maxTexts) return;
        const { width, height } = wc.draft.design;
        texts.push({ ...wcClone(wc.meta.defaultText), x: Math.round(width / 2), y: Math.round(height / 2), maxWidth: width - 80 });
        wc.openText = texts.length - 1;
    } else if (action === 'remove') {
        texts.splice(index, 1);
        wc.openText = Math.min(wc.openText, texts.length - 1);
    } else if (action === 'copy') {
        if (texts.length >= limits.maxTexts) return;
        const copy = wcClone(texts[index]);
        copy.y = Math.min(wc.draft.design.height, copy.y + Math.round(copy.size * 1.2));
        texts.splice(index + 1, 0, copy);
        wc.openText = index + 1;
    } else if (action === 'up' || action === 'down') {
        const target = action === 'up' ? index - 1 : index + 1;
        if (target < 0 || target >= texts.length) return;
        [texts[index], texts[target]] = [texts[target], texts[index]];
        wc.openText = target;
    }

    wcRenderForm();
    wcRenderHandles();
    wcSchedulePreview(0);
    wcUpdateDirty();
}

// ==========================================
// คลังรูปพื้นหลัง
// ==========================================
function wcSelectAsset(assetId) {
    wc.draft.backgroundId = assetId || null;
    document.querySelectorAll('#wc-form .wc-tile[data-asset]').forEach((tile) => {
        tile.classList.toggle('selected', (Number(tile.dataset.asset) || null) === wc.draft.backgroundId);
    });
    wcAfterChange('backgroundId');
}

async function wcUploadAsset(file) {
    const { maxUploadBytes } = wc.meta.limits;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
        return wcError('อัปโหลดไม่ได้', new Error('รองรับเฉพาะไฟล์ PNG, JPG, WEBP และ GIF'));
    }
    if (file.size > maxUploadBytes) {
        return wcError('ไฟล์ใหญ่เกินไป', new Error(`ขนาดไฟล์ต้องไม่เกิน ${wcFormatBytes(maxUploadBytes)}`));
    }

    const tile = document.querySelector('.wc-tile-upload');
    tile?.classList.add('busy');
    try {
        const res = await fetch(`/api/welcome/assets?name=${encodeURIComponent(file.name)}`, {
            method: 'POST',
            headers: { 'Content-Type': file.type },
            body: file,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 413 ? 'ไฟล์ใหญ่เกินกำหนด' : data.error || `HTTP ${res.status}`);

        wc.assets.unshift(data.asset);
        wc.draft.backgroundId = data.asset.id;
        wcRenderForm();
        wcAfterChange('backgroundId');
        wcToast('success', 'อัปโหลดรูปแล้ว', 'เลือกเป็นพื้นหลังให้แล้ว — อย่าลืมกดบันทึก');
    } catch (err) {
        wcError('อัปโหลดรูปไม่สำเร็จ', err);
    } finally {
        tile?.classList.remove('busy');
    }
}

async function wcRenameAsset(id) {
    const asset = wc.assets.find((a) => a.id === id);
    if (!asset) return;
    const { value, isConfirmed } = await Swal.fire({
        title: 'เปลี่ยนชื่อรูป',
        input: 'text',
        inputValue: asset.name,
        inputAttributes: { maxlength: String(wc.meta.limits.maxNameLength) },
        showCancelButton: true,
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#6366f1',
        inputValidator: (v) => (!v.trim() ? 'กรุณาตั้งชื่อรูป' : undefined),
    });
    if (!isConfirmed) return;
    try {
        const data = await wcApi('PATCH', `/api/welcome/assets/${id}`, { name: value.trim() });
        Object.assign(asset, data.asset);
        wcRenderForm();
    } catch (err) {
        wcError('เปลี่ยนชื่อรูปไม่สำเร็จ', err);
    }
}

async function wcDeleteAsset(id) {
    const asset = wc.assets.find((a) => a.id === id);
    if (!asset) return;
    const usedBy = wcAssetUsage(id);
    const note = usedBy ? `มีการ์ด ${usedBy} ใบใช้รูปนี้อยู่ — การ์ดเหล่านั้นจะกลับไปใช้สีพื้นแทน (ลบแล้วกู้คืนไม่ได้)` : 'ลบแล้วกู้คืนไม่ได้';
    if (!(await wcConfirm(`ลบรูป "${asset.name}" ออกจากคลัง?`, note, 'ลบรูป'))) return;

    try {
        await wcApi('DELETE', `/api/welcome/assets/${id}`);
        wc.assets = wc.assets.filter((a) => a.id !== id);
        // ฝั่ง server ตั้ง background ของการ์ดที่ใช้รูปนี้เป็น null ให้แล้ว — ทำให้ข้อมูลในหน้าเว็บตรงกัน
        wc.cards.forEach((card) => { if (card.backgroundId === id) card.backgroundId = null; });
        if (wc.saved?.backgroundId === id) wc.saved.backgroundId = null;
        if (wc.draft?.backgroundId === id) wc.draft.backgroundId = null;
        wcRenderForm();
        wcAfterChange('backgroundId');
        wcToast('success', 'ลบรูปแล้ว');
    } catch (err) {
        wcError('ลบรูปไม่สำเร็จ', err);
    }
}

// ==========================================
// ตัวอย่าง: รูปจาก server + ข้อความจำลองแบบ Discord
// ==========================================
function wcSchedulePreview(delay = WC_PREVIEW_DELAY) {
    if (!wc.draft) return;
    clearTimeout(wc.previewTimer);
    wc.previewTimer = setTimeout(wcRequestPreview, delay);
}

async function wcRequestPreview() {
    const seq = ++wc.previewSeq;
    const stage = document.getElementById('wc-stage');
    const status = document.getElementById('wc-stage-status');
    stage.classList.add('rendering');
    try {
        const data = await wcApi('POST', '/api/welcome/preview', {
            design: wc.draft.design,
            backgroundId: wc.draft.backgroundId,
            userId: wc.sampleUserId,
        });
        // ผู้ใช้แก้ค่าต่อระหว่างรอ → ทิ้งผลลัพธ์เก่า
        if (seq !== wc.previewSeq) return;
        document.getElementById('wc-preview-img').src = data.image;
        wc.vars = data.vars;
        status.classList.add('hidden');
        wcRenderMessage();
    } catch (err) {
        if (seq !== wc.previewSeq) return;
        status.textContent = `สร้างรูปตัวอย่างไม่สำเร็จ: ${err.message}`;
        status.classList.remove('hidden');
    } finally {
        if (seq === wc.previewSeq) stage.classList.remove('rendering');
    }
}

// ข้อความที่ส่งคู่กับรูป — แทนค่าตัวแปรฝั่งหน้าเว็บเลย (ไม่ต้องรอ server) แล้วแสดงแบบ Markdown ของ Discord
function wcRenderMessage() {
    const box = document.getElementById('wc-msg-content');
    document.getElementById('wc-preview-time').textContent =
        `วันนี้ ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`;

    const content = wc.draft?.content || '';
    box.classList.toggle('hidden', !content.trim());
    if (!content.trim()) return;

    const vars = wc.vars || { user: 'สมาชิกใหม่', username: 'new_member', id: '0', server: 'NotStack', memberCount: '0' };
    const filled = content.replace(/\{(\w+)\}/g, (match, key) => {
        if (key === 'mention') return WC_MENTION_TOKEN;
        return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match;
    });
    const html = typeof renderDiscordMarkdown === 'function'
        ? renderDiscordMarkdown(filled)
        : escapeHtml(filled).replace(/\n/g, '<br>');
    // แท็กยศ / ห้อง / คน ที่พิมพ์ไว้เอง (<@&id> <#id> <@id>) — แสดงเป็นชื่อแบบใน Discord
    const mention = (text) => `<span class="wc-mention">${escapeHtml(text)}</span>`;
    box.innerHTML = html
        .split(WC_MENTION_TOKEN).join(mention(`@${vars.user}`))
        .replace(/&lt;@&amp;(\d+)&gt;/g, (m, id) => mention(`@${wc.roles.find((r) => r.id === id)?.name || 'ยศ'}`))
        .replace(/&lt;#(\d+)&gt;/g, (m, id) => mention(`#${wc.channels.find((ch) => ch.id === id)?.name || 'ห้อง'}`))
        .replace(/&lt;@!?(\d+)&gt;/g, () => mention('@ผู้ใช้'));
}

// ==========================================
// จุดจับบนรูปตัวอย่าง — ลากเพื่อย้ายรูปโปรไฟล์/ข้อความ (ภาพจริงวาดใหม่ตามหลังเล็กน้อย)
// ==========================================
function wcRenderHandles() {
    const handles = document.getElementById('wc-handles');
    const { design } = wc.draft;
    document.getElementById('wc-stage').style.aspectRatio = `${design.width} / ${design.height}`;

    handles.innerHTML = `
        <div class="wc-handle wc-handle-avatar" data-handle="avatar" title="ลากเพื่อย้ายรูปโปรไฟล์"></div>
        ${design.texts.map((layer, i) => `
            <div class="wc-handle wc-handle-text" data-handle="${i}" title="${escapeHtml(wcLayerTitle(layer))}">${i + 1}</div>`).join('')}`;
    wcPositionHandles();
}

function wcPositionHandles() {
    const stage = document.getElementById('wc-stage');
    if (!wc.draft || !stage.clientWidth) return;
    const { design } = wc.draft;
    const scale = stage.clientWidth / design.width;

    const avatarEl = stage.querySelector('[data-handle="avatar"]');
    if (avatarEl) {
        const { avatar } = design;
        const box = (avatar.size + avatar.borderWidth * 2) * scale;
        avatarEl.classList.toggle('hidden', !avatar.visible);
        avatarEl.classList.toggle('round', avatar.shape === 'circle');
        Object.assign(avatarEl.style, {
            width: `${box}px`,
            height: `${box}px`,
            left: `${avatar.x * scale - box / 2}px`,
            top: `${avatar.y * scale - box / 2}px`,
        });
    }
    stage.querySelectorAll('.wc-handle-text').forEach((el) => {
        const layer = design.texts[Number(el.dataset.handle)];
        if (!layer) return;
        el.style.left = `${layer.x * scale}px`;
        el.style.top = `${layer.y * scale}px`;
        el.title = wcLayerTitle(layer);
    });
}

function wcFocusElement(handle) {
    if (handle === 'avatar') {
        wc.section = 'avatar';
    } else {
        wc.section = 'texts';
        wc.openText = Number(handle);
    }
    wcRenderEditorHead();
    wcRenderForm();
    const open = document.querySelector('.wc-layer.open');
    if (open) open.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function wcStartDrag(e, el) {
    if (e.button !== 0) return;
    e.preventDefault();
    const stage = document.getElementById('wc-stage');
    const { design } = wc.draft;
    const handle = el.dataset.handle;
    const target = handle === 'avatar' ? design.avatar : design.texts[Number(handle)];
    const base = handle === 'avatar' ? 'design.avatar' : `design.texts.${handle}`;
    if (!target) return;

    const scale = stage.clientWidth / design.width;
    const start = { px: e.clientX, py: e.clientY, x: target.x, y: target.y };
    const snap = 8 / scale; // ดูดเข้ากึ่งกลางเมื่อลากมาใกล้ (8 พิกเซลบนจอ)
    const guideV = document.getElementById('wc-guide-v');
    const guideH = document.getElementById('wc-guide-h');
    let moved = false;

    el.setPointerCapture(e.pointerId);
    stage.classList.add('dragging');

    const onMove = (ev) => {
        const dx = (ev.clientX - start.px) / scale;
        const dy = (ev.clientY - start.py) / scale;
        if (!moved && Math.hypot(ev.clientX - start.px, ev.clientY - start.py) < 3) return;
        moved = true;

        let x = Math.round(Math.min(design.width, Math.max(0, start.x + dx)));
        let y = Math.round(Math.min(design.height, Math.max(0, start.y + dy)));
        const snapX = Math.abs(x - design.width / 2) < snap;
        const snapY = Math.abs(y - design.height / 2) < snap;
        if (snapX) x = Math.round(design.width / 2);
        if (snapY) y = Math.round(design.height / 2);
        guideV.classList.toggle('hidden', !snapX);
        guideH.classList.toggle('hidden', !snapY);

        target.x = x;
        target.y = y;
        wcSyncInputs(`${base}.x`, x);
        wcSyncInputs(`${base}.y`, y);
        wcPositionHandles();
        wcSchedulePreview();
        wcUpdateDirty();
    };

    const onUp = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        stage.classList.remove('dragging');
        guideV.classList.add('hidden');
        guideH.classList.add('hidden');
        // คลิกเฉยๆ (ไม่ได้ลาก) = เปิดการตั้งค่าขององค์ประกอบนั้น
        if (!moved) wcFocusElement(handle);
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
}

// ==========================================
// จัดการการ์ด: สร้าง / คัดลอก / ลบ / บันทึก / ยกเลิก / เปิด-ปิด / ส่งทดสอบ
// ==========================================
async function wcCreateCard(duplicateOf) {
    if (wcIsDirty() && !(await wcConfirm('ทิ้งการแก้ไขที่ยังไม่บันทึก?', `การ์ด "${wc.draft.name}" มีการแก้ไขที่ยังไม่ได้กดบันทึก`, 'ทิ้งการแก้ไข'))) return;
    try {
        const data = await wcApi('POST', '/api/welcome/cards', duplicateOf ? { duplicateOf } : {});
        wc.cards.push(data.card);
        wcSelect(data.card.id, { force: true });
        wcToast('success', duplicateOf ? 'คัดลอกการ์ดแล้ว' : 'สร้างการ์ดใหม่แล้ว', 'การ์ดใหม่ปิดอยู่ — ตั้งค่าเสร็จแล้วค่อยเปิดใช้งาน');
    } catch (err) {
        wcError('สร้างการ์ดไม่สำเร็จ', err);
    }
}

async function wcDeleteCard() {
    const card = wc.cards.find((c) => c.id === wc.selectedId);
    if (!card) return;
    if (!(await wcConfirm(`ลบการ์ด "${card.name}"?`, 'ลบแล้วกู้คืนไม่ได้ (รูปในคลังรูปยังอยู่)', 'ลบการ์ด'))) return;
    try {
        await wcApi('DELETE', `/api/welcome/cards/${card.id}`);
        wc.cards = wc.cards.filter((c) => c.id !== card.id);
        wc.selectedId = null;
        wc.saved = null;
        wc.draft = null;
        wcRenderList();
        if (wc.cards.length) wcSelect(wc.cards[0].id, { force: true });
        else wcShowEditor(false);
        wcToast('success', 'ลบการ์ดแล้ว');
    } catch (err) {
        wcError('ลบการ์ดไม่สำเร็จ', err);
    }
}

async function wcSave() {
    if (!wcIsDirty()) return;
    if (!wc.draft.name.trim()) return wcError('บันทึกไม่ได้', new Error('กรุณาตั้งชื่อการ์ด'));

    const btn = document.getElementById('wc-save-btn');
    btn.disabled = true;
    try {
        const data = await wcApi('PATCH', `/api/welcome/cards/${wc.selectedId}`, wcPick(wc.draft));
        const index = wc.cards.findIndex((c) => c.id === data.card.id);
        if (index !== -1) wc.cards[index] = data.card;
        // ใช้ค่าที่ server ตรวจแล้ว (อาจถูกบีบให้อยู่ในช่วงที่อนุญาต)
        wc.saved = wcClone(data.card);
        wc.draft = wcClone(data.card);
        wcRenderList();
        wcRenderEditorHead();
        wcRenderForm();
        wcRenderHandles();
        wcRenderMessage();
        wcSchedulePreview(0);
        if (data.warning) {
            Swal.fire({ icon: 'warning', title: 'บันทึกแล้ว แต่ยังส่งการ์ดไม่ได้', text: data.warning, confirmButtonColor: '#6366f1' });
        } else {
            wcToast('success', 'บันทึกการ์ดแล้ว');
        }
    } catch (err) {
        wcError('บันทึกไม่สำเร็จ', err);
    } finally {
        wcUpdateDirty();
    }
}

function wcRevert() {
    if (!wc.saved) return;
    wc.draft = wcClone(wc.saved);
    wcRenderEditorHead();
    wcRenderForm();
    wcRenderHandles();
    wcRenderMessage();
    wcSchedulePreview(0);
    wcUpdateDirty();
}

// เปิด/ปิดบันทึกทันที (ทั้งสวิตช์ในรายการและบนหัวตัวแก้ไข) — ไม่กระทบการแก้ไขอื่นที่ค้างอยู่
async function wcToggleCard(id, enabled, input) {
    const card = wc.cards.find((c) => c.id === id);
    if (!card) return;
    if (enabled && !card.channelId) {
        input.checked = false;
        return wcError('ยังเปิดใช้งานไม่ได้', new Error('เลือกห้องที่จะส่งแล้วกด "บันทึก" ก่อนเปิดใช้งาน'));
    }
    try {
        const data = await wcApi('PATCH', `/api/welcome/cards/${id}`, { enabled });
        card.enabled = data.card.enabled;
        if (id === wc.selectedId) {
            wc.saved.enabled = card.enabled;
            wc.draft.enabled = card.enabled;
            document.getElementById('wc-enabled').checked = card.enabled;
        }
        wcRenderList();
        if (data.warning) {
            Swal.fire({ icon: 'warning', title: 'เปิดใช้งานแล้ว แต่ยังส่งการ์ดไม่ได้', text: data.warning, confirmButtonColor: '#6366f1' });
        } else {
            wcToast('success', enabled ? 'เปิดใช้งานการ์ดแล้ว' : 'ปิดการ์ดแล้ว');
        }
    } catch (err) {
        input.checked = !enabled;
        wcError('เปลี่ยนสถานะไม่สำเร็จ', err);
    }
}

async function wcTestSend() {
    if (!wc.draft.channelId) return wcError('ยังส่งทดสอบไม่ได้', new Error('กรุณาเลือกห้องที่จะส่งในหมวด "ทั่วไป" ก่อน'));
    const who = wc.vars?.user || 'บัญชีของคุณ';
    const ok = await wcConfirm(
        `ส่งการ์ดทดสอบเข้า ${wcChannelName(wc.draft.channelId)}?`,
        `ใช้ค่าที่กำลังแก้อยู่ตอนนี้ (แม้ยังไม่บันทึก) โดยใช้ ${who} เป็นสมาชิกตัวอย่าง — สมาชิกในห้องนั้นจะเห็นข้อความนี้`,
        'ส่งทดสอบ',
        false,
    );
    if (!ok) return;

    const btn = document.getElementById('wc-test-btn');
    btn.disabled = true;
    try {
        const data = await wcApi('POST', '/api/welcome/test', {
            channelId: wc.draft.channelId,
            content: wc.draft.content,
            design: wc.draft.design,
            backgroundId: wc.draft.backgroundId,
            userId: wc.sampleUserId,
        });
        wcToast('success', 'ส่งทดสอบแล้ว', data.message);
    } catch (err) {
        wcError('ส่งทดสอบไม่สำเร็จ', err);
    } finally {
        btn.disabled = false;
    }
}

// ==========================================
// ผูก event (ครั้งเดียว) — ฟอร์มถูกสร้างใหม่บ่อย จึงใช้ event delegation ที่กล่องแม่
// ==========================================
function wcBindStaticEvents() {
    if (wc.bound) return;
    wc.bound = true;
    const form = document.getElementById('wc-form');
    const list = document.getElementById('wc-card-list');

    // slider / ช่องข้อความ / สี / select / สวิตช์ → อัปเดตทันทีที่ขยับ
    form.addEventListener('input', (e) => {
        const el = e.target.closest('[data-path]');
        if (el && !el.classList.contains('wc-num')) wcApplyInput(el);
    });

    // ช่องตัวเลข → รอพิมพ์เสร็จ (Enter / ออกจากช่อง) ไม่งั้นระหว่างพิมพ์จะโดนบีบค่าจนพิมพ์ไม่ได้
    form.addEventListener('change', (e) => {
        const el = e.target;
        if (el.matches('.wc-num[data-path]')) wcApplyInput(el);
        else if (el.matches('[data-canvas]')) {
            const width = Number(form.querySelector('[data-canvas="width"]').value);
            const height = Number(form.querySelector('[data-canvas="height"]').value);
            wcSetCanvasSize(width, height);
        } else if (el.matches('[data-canvas-preset]') && el.value !== 'custom') {
            const [width, height] = el.value.split('x').map(Number);
            wcSetCanvasSize(width, height);
        } else if (el.id === 'wc-upload-input' && el.files[0]) {
            wcUploadAsset(el.files[0]);
            el.value = '';
        }
    });

    form.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-set-path]');
        if (seg) {
            wcSet(seg.dataset.setPath, seg.dataset.setValue);
            seg.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === seg));
            return wcAfterChange(seg.dataset.setPath);
        }

        const center = e.target.closest('[data-center-path]');
        if (center) {
            const value = Number(center.dataset.centerValue);
            wcSet(center.dataset.centerPath, value);
            wcSyncInputs(center.dataset.centerPath, value);
            return wcAfterChange(center.dataset.centerPath);
        }

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

        const layerBtn = e.target.closest('[data-layer-action]');
        if (layerBtn) return wcLayerAction(layerBtn.dataset.layerAction, Number(layerBtn.dataset.index));

        const assetBtn = e.target.closest('[data-asset-action]');
        if (assetBtn) {
            e.stopPropagation();
            const id = Number(assetBtn.dataset.id);
            return assetBtn.dataset.assetAction === 'rename' ? wcRenameAsset(id) : wcDeleteAsset(id);
        }

        const tile = e.target.closest('.wc-tile[data-asset]');
        if (tile) wcSelectAsset(Number(tile.dataset.asset) || null);
    });

    form.addEventListener('keydown', (e) => {
        const tile = e.target.closest('.wc-tile[data-asset]');
        if (tile && e.target === tile && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            wcSelectAsset(Number(tile.dataset.asset) || null);
        }
    });

    list.addEventListener('change', (e) => {
        const toggle = e.target.closest('[data-card-toggle]');
        if (toggle) wcToggleCard(Number(toggle.dataset.cardToggle), toggle.checked, toggle);
    });
    list.addEventListener('click', (e) => {
        if (e.target.closest('.switch')) return;
        const item = e.target.closest('[data-card]');
        if (item) wcSelect(Number(item.dataset.card));
    });
    list.addEventListener('keydown', (e) => {
        const item = e.target.closest('[data-card]');
        if (item && e.target === item && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            wcSelect(Number(item.dataset.card));
        }
    });

    document.getElementById('wc-sections').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-section]');
        if (!btn || btn.dataset.section === wc.section) return;
        wc.section = btn.dataset.section;
        wcRenderEditorHead();
        wcRenderForm();
    });

    document.getElementById('wc-enabled').addEventListener('change', (e) => wcToggleCard(wc.selectedId, e.target.checked, e.target));
    document.getElementById('wc-save-btn').addEventListener('click', wcSave);
    document.getElementById('wc-revert-btn').addEventListener('click', wcRevert);
    document.getElementById('wc-test-btn').addEventListener('click', wcTestSend);
    document.getElementById('wc-duplicate-btn').addEventListener('click', () => wcCreateCard(wc.selectedId));
    document.getElementById('wc-delete-btn').addEventListener('click', wcDeleteCard);

    document.getElementById('wc-handles').addEventListener('pointerdown', (e) => {
        const handle = e.target.closest('[data-handle]');
        if (handle) wcStartDrag(e, handle);
    });
    new ResizeObserver(wcPositionHandles).observe(document.getElementById('wc-stage'));

    // สมาชิกตัวอย่างในรูป — ค่าเริ่มต้นคือบัญชี Discord ของแอดมินที่ login อยู่
    wc.picker = UserPicker.create(document.querySelector('[data-user-picker="wc-sample"]'), {
        placeholder: 'พิมพ์ชื่อสมาชิกเพื่อดูตัวอย่างในนามคนนั้น...',
        onSelect: (user) => {
            wc.sampleUserId = user.userId;
            wcSchedulePreview(0);
        },
    });
    document.getElementById('wc-sample-reset').addEventListener('click', () => {
        wc.picker.clear();
        wc.sampleUserId = null;
        wcSchedulePreview(0);
    });

    // Ctrl/⌘ + S = บันทึก (เฉพาะตอนเปิดแท็บนี้อยู่)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !document.getElementById('welcome-tab').classList.contains('hidden')) {
            e.preventDefault();
            wcSave();
        }
    });

    window.addEventListener('beforeunload', (e) => {
        if (!wcIsDirty()) return;
        e.preventDefault();
        e.returnValue = '';
    });
}
