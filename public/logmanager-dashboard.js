// Log Management tab — เปิด/ปิด log แต่ละชนิด + เลือกห้องปลายทาง + เลือกสี embed
// บันทึกอัตโนมัติทันทีที่แก้ค่า (ไม่ต้องกดปุ่ม Save)

let logChannels = [];   // รายชื่อห้องในเซิร์ฟเวอร์ (ห้องส่ง log ใช้เฉพาะที่ sendable)
let logRoles = [];      // รายชื่อยศ ใช้กับ ignore list
let logEvents = [];     // การตั้งค่าปัจจุบันของแต่ละ event
let logOptions = { ignoredChannels: [], ignoredUsers: [], ignoredRoles: [], ignoreBots: true };
let ignoredUserNames = {};

document.addEventListener('DOMContentLoaded', () => {
    initLogManagerTab();
});

async function initLogManagerTab() {
    try {
        const [channelsRes, rolesRes, settingsRes] = await Promise.all([
            fetch('/api/guild-channels'),
            fetch('/api/guild-roles'),
            fetch('/api/log-settings')
        ]);

        // ถ้าบอทยังไม่ออนไลน์ ยังให้ตั้งค่าต่อได้ แค่ dropdown ว่าง
        logChannels = channelsRes.ok ? await channelsRes.json() : [];
        logRoles = rolesRes.ok ? await rolesRes.json() : [];

        if (!settingsRes.ok) throw new Error('โหลดการตั้งค่าไม่สำเร็จ');
        const settings = await settingsRes.json();
        logEvents = settings.events || [];
        logOptions = settings.options || logOptions;
        ignoredUserNames = settings.ignoredUserNames || {};

        document.getElementById('log-system-toggle').checked = settings.systemEnabled !== false;
        renderLogBulkChannel();
        renderIgnorePanel();
        renderLogGroups(settings.groups || []);

        document.getElementById('logmanager-loading').classList.add('hidden');
        document.getElementById('logmanager-content').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading log settings:', error);
        const loading = document.getElementById('logmanager-loading');
        if (loading) loading.innerHTML = '<p style="color: #ef4444;">โหลดการตั้งค่า Log ไม่สำเร็จ</p>';
    }
}

function escapeLogHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

// สร้าง <option> ของห้องทั้งหมด จัดกลุ่มตามหมวดหมู่ของ Discord
function buildChannelOptions(selectedId) {
    let html = `<option value="">เลือก ..</option>`;

    const byCategory = {};
    logChannels.filter(ch => ch.sendable).forEach(ch => {
        if (!byCategory[ch.category]) byCategory[ch.category] = [];
        byCategory[ch.category].push(ch);
    });

    Object.keys(byCategory).forEach(category => {
        html += `<optgroup label="${escapeLogHtml(category)}">`;
        byCategory[category].forEach(ch => {
            const selected = ch.id === selectedId ? ' selected' : '';
            html += `<option value="${escapeLogHtml(ch.id)}"${selected}>#${escapeLogHtml(ch.name)}</option>`;
        });
        html += `</optgroup>`;
    });

    // ห้องที่เคยตั้งไว้แต่หาไม่เจอแล้ว (ถูกลบ / บอทมองไม่เห็น) — ยังคงค่าไว้ไม่ให้หายไปเงียบๆ
    if (selectedId && !logChannels.some(ch => ch.sendable && ch.id === selectedId)) {
        html += `<option value="${escapeLogHtml(selectedId)}" selected>ID: ${escapeLogHtml(selectedId)} (ไม่พบห้องนี้)</option>`;
    }

    return html;
}

function renderLogBulkChannel() {
    const select = document.getElementById('log-bulk-channel');
    if (select) select.innerHTML = buildChannelOptions('');
}

function renderLogGroups(groups) {
    const container = document.getElementById('log-groups');
    if (!container) return;

    // เผื่อกรณี event มี group ที่ไม่ได้อยู่ในลำดับที่ backend ส่งมา
    const orderedGroups = groups.length ? groups : [...new Set(logEvents.map(e => e.group))];
    const extraGroups = [...new Set(logEvents.map(e => e.group))].filter(g => !orderedGroups.includes(g));

    let html = '';
    [...orderedGroups, ...extraGroups].forEach(group => {
        const events = logEvents.filter(e => e.group === group);
        if (events.length === 0) return;

        html += `<div class="log-group-title">${escapeLogHtml(group)}</div>`;
        html += `<div class="log-grid">`;
        events.forEach(event => {
            html += `
                <div class="log-card" data-key="${escapeLogHtml(event.key)}">
                    <div class="log-card-head">
                        <span class="log-card-title" title="${escapeLogHtml(event.label)}">${escapeLogHtml(event.label)}</span>
                        <label class="switch">
                            <input type="checkbox" ${event.enabled ? 'checked' : ''} onchange="saveLogSetting('${escapeLogHtml(event.key)}', { enabled: this.checked }, this)">
                            <span class="slider"></span>
                        </label>
                    </div>
                    <select class="input-select log-channel-select" onchange="saveLogSetting('${escapeLogHtml(event.key)}', { channelId: this.value }, this)">
                        ${buildChannelOptions(event.channelId)}
                    </select>
                    <label class="log-color-label">สี</label>
                    <input type="color" class="log-color-input" value="${escapeLogHtml(event.color)}" onchange="saveLogSetting('${escapeLogHtml(event.key)}', { color: this.value }, this)">
                </div>
            `;
        });
        html += `</div>`;
    });

    container.innerHTML = html;
}

// บันทึกทีละฟิลด์ — ถ้าไม่สำเร็จจะย้อนค่าใน UI กลับ เพื่อไม่ให้หน้าจอโกหกว่าบันทึกแล้ว
async function saveLogSetting(key, patch, element) {
    try {
        const response = await fetch('/api/log-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, ...patch })
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'บันทึกไม่สำเร็จ');
        }

        // อัปเดต state ฝั่ง client ให้ตรงกับที่บันทึกจริง
        const event = logEvents.find(e => e.key === key);
        if (event) Object.assign(event, patch);

        if (element) {
            element.closest('.log-card')?.classList.add('log-card-saved');
            setTimeout(() => element.closest('.log-card')?.classList.remove('log-card-saved'), 800);
        }

        showLogToast('บันทึกแล้ว');
    } catch (error) {
        console.error('Error saving log setting:', error);
        // ย้อนค่ากลับตาม state ล่าสุดที่บันทึกสำเร็จ
        const event = logEvents.find(e => e.key === key);
        if (element && event) {
            if ('enabled' in patch) element.checked = event.enabled;
            if ('channelId' in patch) element.value = event.channelId;
            if ('color' in patch) element.value = event.color;
        }
        Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message, confirmButtonColor: '#6366f1' });
    }
}

async function toggleLogSystem(checkbox) {
    const enabled = checkbox.checked;
    try {
        const response = await fetch('/api/log-settings/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'บันทึกไม่สำเร็จ');

        showLogToast(enabled ? 'เปิดระบบ Log แล้ว' : 'ปิดระบบ Log แล้ว');
    } catch (error) {
        checkbox.checked = !enabled;
        Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message, confirmButtonColor: '#6366f1' });
    }
}

async function applyChannelToAll() {
    const channelId = document.getElementById('log-bulk-channel').value;
    if (!channelId) {
        return Swal.fire({ icon: 'warning', title: 'ยังไม่ได้เลือกห้อง', text: 'กรุณาเลือกห้องปลายทางก่อน', confirmButtonColor: '#6366f1' });
    }

    const channelName = logChannels.find(c => c.id === channelId)?.name || channelId;
    const confirm = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการตั้งค่า',
        text: `ตั้งให้ log ทุกรายการส่งเข้าห้อง #${channelName} ใช่ไหม? (ค่าห้องเดิมของทุกรายการจะถูกทับ)`,
        showCancelButton: true,
        confirmButtonText: 'ตกลง',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#6366f1'
    });
    if (!confirm.isConfirmed) return;

    try {
        const response = await fetch('/api/log-settings/apply-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'บันทึกไม่สำเร็จ');

        logEvents = result.events || logEvents;
        renderLogGroups([...new Set(logEvents.map(e => e.group))]);
        showLogToast('ตั้งห้องให้ทุกรายการแล้ว');
    } catch (error) {
        Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message, confirmButtonColor: '#6366f1' });
    }
}

// ==========================================
// 🚫 IGNORE LIST
// ==========================================
function ignoreConfig(kind) {
    if (kind === 'channel') {
        return {
            listKey: 'ignoredChannels',
            chipsId: 'ignore-channel-chips',
            inputId: 'ignore-channel-select',
            nameOf: id => {
                const ch = logChannels.find(c => c.id === id);
                if (!ch) return `ID: ${id}`;
                return ch.isCategory ? `📂 ${ch.name}` : `#${ch.name}`;
            },
        };
    }
    if (kind === 'role') {
        return {
            listKey: 'ignoredRoles',
            chipsId: 'ignore-role-chips',
            inputId: 'ignore-role-select',
            nameOf: id => {
                const role = logRoles.find(r => r.id === id);
                return role ? `@${role.name}` : `ID: ${id}`;
            },
        };
    }
    return {
        listKey: 'ignoredUsers',
        chipsId: 'ignore-user-chips',
        inputId: 'ignore-user-input',
        nameOf: id => ignoredUserNames[id] ? `@${ignoredUserNames[id]}` : `ID: ${id}`,
    };
}

function renderIgnorePanel() {
    document.getElementById('log-ignore-bots').checked = logOptions.ignoreBots !== false;

    const channelSelect = document.getElementById('ignore-channel-select');
    if (channelSelect) {
        let html = '<option value="">เลือกห้องหรือหมวดหมู่ ..</option>';
        logChannels.forEach(ch => {
            const label = ch.isCategory ? `📂 ${ch.name} (ทั้งหมวด)` : `#${ch.name}`;
            html += `<option value="${escapeLogHtml(ch.id)}">${escapeLogHtml(label)}</option>`;
        });
        channelSelect.innerHTML = html;
    }

    const roleSelect = document.getElementById('ignore-role-select');
    if (roleSelect) {
        let html = '<option value="">เลือกยศ ..</option>';
        logRoles.forEach(r => {
            html += `<option value="${escapeLogHtml(r.id)}">@${escapeLogHtml(r.name)}</option>`;
        });
        roleSelect.innerHTML = html;
    }

    ['channel', 'role', 'user'].forEach(renderIgnoreChips);
}

function renderIgnoreChips(kind) {
    const config = ignoreConfig(kind);
    const container = document.getElementById(config.chipsId);
    if (!container) return;

    const list = logOptions[config.listKey] || [];
    if (list.length === 0) {
        container.innerHTML = '<span class="log-chips-empty">ยังไม่ได้ยกเว้นอะไร</span>';
        return;
    }

    container.innerHTML = list.map(id => `
        <span class="log-chip">
            ${escapeLogHtml(config.nameOf(id))}
            <button type="button" onclick="removeIgnoreEntry('${escapeLogHtml(kind)}', '${escapeLogHtml(id)}')">✕</button>
        </span>
    `).join('');
}

async function addIgnoreEntry(kind) {
    const config = ignoreConfig(kind);
    const input = document.getElementById(config.inputId);
    const value = (input.value || '').trim();
    if (!value) return;

    const list = logOptions[config.listKey] || [];
    if (list.includes(value)) {
        input.value = '';
        return showLogToast('มีอยู่ในรายการแล้ว');
    }

    logOptions[config.listKey] = [...list, value];
    input.value = '';
    await saveLogOptions();
}

async function removeIgnoreEntry(kind, id) {
    const config = ignoreConfig(kind);
    logOptions[config.listKey] = (logOptions[config.listKey] || []).filter(x => x !== id);
    await saveLogOptions();
}

async function saveLogOptions() {
    const snapshot = JSON.parse(JSON.stringify(logOptions));
    logOptions.ignoreBots = document.getElementById('log-ignore-bots').checked;

    try {
        const response = await fetch('/api/log-settings/options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logOptions)
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'บันทึกไม่สำเร็จ');

        logOptions = result.options;
        // ดึงชื่อผู้ใช้ที่เพิ่งเพิ่มเข้ามาใหม่
        const refreshed = await fetch('/api/log-settings').then(r => r.ok ? r.json() : null).catch(() => null);
        if (refreshed?.ignoredUserNames) ignoredUserNames = refreshed.ignoredUserNames;

        renderIgnorePanel();
        showLogToast('บันทึกตัวกรองแล้ว');
    } catch (error) {
        logOptions = snapshot; // ย้อนค่ากลับ ไม่ให้หน้าจอโกหกว่าบันทึกแล้ว
        renderIgnorePanel();
        Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: error.message, confirmButtonColor: '#6366f1' });
    }
}

function showLogToast(title) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title,
        showConfirmButton: false,
        timer: 1600,
        timerProgressBar: true
    });
}
