// PR Bot tab — friendly editor for PR_CHANNEL_ID, PR_ORG_CHANNEL_MAP, PR_REPO_MENTION_MAP
// ใช้ endpoint /api/config เดิมที่มีอยู่แล้ว (เหมือนช่อง config อื่นๆ) ไม่มีการเพิ่ม backend endpoint ใหม่

document.addEventListener('DOMContentLoaded', () => {
    fetchPrBotConfig();
});

async function fetchPrBotConfig() {
    try {
        const response = await fetch('/api/config');
        const configs = await response.json();

        const defaultChannel = configs.find(c => c.key === 'PR_CHANNEL_ID');
        const orgMapRow = configs.find(c => c.key === 'PR_ORG_CHANNEL_MAP');
        const mentionMapRow = configs.find(c => c.key === 'PR_REPO_MENTION_MAP');

        const defaultInput = document.getElementById('prbot-default-channel');
        if (defaultInput) defaultInput.value = defaultChannel?.value || '';

        renderPrBotRows('prbot-org-rows', parsePrBotJsonMap(orgMapRow?.value), 'เช่น MUDST-2026-Pegasus', 'Channel ID');
        renderPrBotRows('prbot-mention-rows', parsePrBotJsonMap(mentionMapRow?.value), 'เช่น MUDST-2026-Pegasus/pegasus-tcg-api', 'Role name หรือ <@&ROLE_ID>');

        document.getElementById('prbot-loading').classList.add('hidden');
        document.getElementById('prbot-content').classList.remove('hidden');
    } catch (error) {
        console.error('Error fetching PR bot config:', error);
        const loading = document.getElementById('prbot-loading');
        if (loading) loading.innerHTML = '<p style="color: #ef4444;">โหลดข้อมูลไม่สำเร็จ</p>';
    }
}

function parsePrBotJsonMap(raw) {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch (e) {
        return {};
    }
}

function escapePrBotHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

function renderPrBotRows(containerId, map, keyPlaceholder, valuePlaceholder) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    container.dataset.keyPlaceholder = keyPlaceholder;
    container.dataset.valuePlaceholder = valuePlaceholder;

    const entries = Object.entries(map);
    if (entries.length === 0) entries.push(['', '']);
    entries.forEach(([k, v]) => addPrBotRow(containerId, k, v));
}

function addPrBotRow(containerId, key = '', value = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    const keyPlaceholder = container.dataset.keyPlaceholder || '';
    const valuePlaceholder = container.dataset.valuePlaceholder || '';

    const row = document.createElement('div');
    row.className = 'prbot-row';
    row.innerHTML = `
        <input type="text" class="input-select prbot-key" placeholder="${escapePrBotHtml(keyPlaceholder)}" value="${escapePrBotHtml(key)}">
        <input type="text" class="input-select prbot-value" placeholder="${escapePrBotHtml(valuePlaceholder)}" value="${escapePrBotHtml(value)}">
        <button type="button" class="prbot-remove-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    container.appendChild(row);
}

function addOrgRow() {
    addPrBotRow('prbot-org-rows');
}

function addMentionRow() {
    addPrBotRow('prbot-mention-rows');
}

function collectPrBotMap(containerId) {
    const rows = document.querySelectorAll(`#${containerId} .prbot-row`);
    const map = {};
    rows.forEach(row => {
        const key = row.querySelector('.prbot-key').value.trim();
        const value = row.querySelector('.prbot-value').value.trim();
        if (key && value) map[key] = value;
    });
    return map;
}

function notifyPrBot(icon, title, text) {
    if (window.Swal) {
        Swal.fire({ toast: true, position: 'top-end', icon, title, text, showConfirmButton: false, timer: 2500, timerProgressBar: true });
    }
}

async function savePrBotConfigKey(key, value, successMessage) {
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        const result = await response.json();
        if (result.success) {
            notifyPrBot('success', successMessage);
        } else {
            notifyPrBot('error', 'เกิดข้อผิดพลาด', result.error);
        }
    } catch (e) {
        notifyPrBot('error', 'เชื่อมต่อไม่สำเร็จ', 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้');
    }
}

function savePrDefaultChannel() {
    const value = document.getElementById('prbot-default-channel').value.trim();
    if (!value) return;
    savePrBotConfigKey('PR_CHANNEL_ID', value, 'บันทึกห้อง Default แล้ว');
}

function saveOrgMap() {
    const map = collectPrBotMap('prbot-org-rows');
    savePrBotConfigKey('PR_ORG_CHANNEL_MAP', JSON.stringify(map), 'บันทึก Organization Mapping แล้ว');
}

function saveMentionMap() {
    const map = collectPrBotMap('prbot-mention-rows');
    savePrBotConfigKey('PR_REPO_MENTION_MAP', JSON.stringify(map), 'บันทึก Mention Mapping แล้ว');
}
