let vgMode = 'whitelist';
let vgData = [];

function apiBase() {
    return vgMode === 'whitelist' ? '/api/whitelist' : '/api/blacklist';
}

function switchVGMode(mode) {
    vgMode = mode;
    document.getElementById('vg-mode-wl').classList.toggle('active', mode === 'whitelist');
    document.getElementById('vg-mode-bl').classList.toggle('active', mode === 'blacklist');
    document.getElementById('vg-mode-bl').classList.toggle('vg-mode-bl-active', mode === 'blacklist');
    document.getElementById('vg-mode-wl').classList.toggle('vg-mode-bl-active', false);
    loadVGData();
}

async function loadWhitelistTab() {
    await loadVoiceChannels();
    await loadVGData();
}

async function loadVoiceChannels() {
    try {
        const res = await fetch('/api/voice-channels');
        const channels = await res.json();
        const select = document.getElementById('vg-channel-select');
        let html = '<option value="">-- เลือกห้องเสียง --</option>';
        channels.forEach(ch => {
            html += `<option value="${escapeHtml(ch.id)}">${escapeHtml(ch.name)}</option>`;
        });
        select.innerHTML = html;
    } catch (e) {
        console.error('Error loading voice channels:', e);
    }
}

async function loadVGData() {
    try {
        const res = await fetch(apiBase());
        vgData = await res.json();
        renderVGChannels();
    } catch (e) {
        console.error('Error loading VG data:', e);
    }
}

function renderVGChannels() {
    const container = document.getElementById('vg-channels-container');
    if (!vgData || vgData.length === 0) {
        const modeLabel = vgMode === 'whitelist' ? 'whitelist' : 'blacklist';
        container.innerHTML = `<p class="vg-empty">ยังไม่มีห้องใน ${modeLabel}</p>`;
        return;
    }

    let html = '';
    vgData.forEach(ch => {
        const cardClass = vgMode === 'blacklist' ? 'vg-card vg-card-bl' : 'vg-card';
        const toggleChecked = ch.enabled ? 'checked' : '';
        const notifyChecked = ch.notify ? 'checked' : '';

        html += `
        <div class="${cardClass}" id="vg-card-${ch.channelId}">
            <div class="vg-card-head">
                <div class="vg-card-title">${escapeHtml(ch.channelName)}</div>
                <div class="vg-card-actions">
                    <label class="switch">
                        <input type="checkbox" ${toggleChecked} onchange="toggleVGChannel('${ch.channelId}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    <button class="prbot-remove-btn" onclick="deleteVGChannel('${ch.channelId}')">X</button>
                </div>
            </div>

            <label class="vg-notify-row">
                <span>ส่ง DM แจ้งผู้ใช้เมื่อถูกเตะออก</span>
                <span class="switch">
                    <input type="checkbox" ${notifyChecked} onchange="toggleVGNotify('${ch.channelId}', this.checked)">
                    <span class="slider"></span>
                </span>
            </label>

            <div class="vg-picker" data-vg-picker="${ch.channelId}"></div>

            <div class="vg-users" id="vg-users-${ch.channelId}">
                ${renderVGUsers(ch.channelId, ch.users)}
            </div>
        </div>`;
    });

    container.innerHTML = html;
    mountVGPickers();
}

// การ์ดถูกสร้างใหม่ทุกครั้งที่โหลดข้อมูล จึงต้องผูก user picker ใหม่ตามไปด้วย
function mountVGPickers() {
    document.querySelectorAll('[data-vg-picker]').forEach(el => {
        const channelId = el.dataset.vgPicker;
        UserPicker.forget(`vg-${channelId}`);
        el.dataset.userPicker = `vg-${channelId}`;
        UserPicker.create(el, {
            placeholder: 'เพิ่มสมาชิก — พิมพ์ชื่อหรือ username...',
            keepSelection: false,
            exclude: () => (vgData.find(c => c.channelId === channelId)?.users || []).map(u => u.userId),
            onSelect: (user) => addVGMember(channelId, user.userId),
        });
    });
}

function renderVGUsers(channelId, users) {
    if (!users || users.length === 0) {
        return '<p class="vg-empty-users">ยังไม่มีสมาชิก</p>';
    }

    return users.map(u => `
        <div class="vg-user" id="vg-user-${channelId}-${u.userId}">
            <img class="vg-user-avatar" src="${escapeHtml(u.avatar)}" alt="">
            <div class="vg-user-info">
                <div class="vg-user-name">${escapeHtml(u.username)}</div>
                <div class="vg-user-id">${escapeHtml(u.userId)}</div>
            </div>
            <button class="vg-user-remove" onclick="removeVGUser('${channelId}', '${u.userId}')">X</button>
        </div>
    `).join('');
}

async function addVGMember(channelId, userId) {
    try {
        const res = await fetch(`${apiBase()}/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, userId })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.error || 'เพิ่มสมาชิกไม่สำเร็จ');
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'เพิ่มสมาชิกสำเร็จ', showConfirmButton: false, timer: 2000, timerProgressBar: true });
        await loadVGData();
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: e.message });
    }
}

async function removeVGUser(channelId, userId) {
    try {
        const res = await fetch(`${apiBase()}/user/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, userId })
        });
        const result = await res.json();
        if (result.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ลบสมาชิกสำเร็จ', showConfirmButton: false, timer: 2000, timerProgressBar: true });
            await loadVGData();
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: e.message });
    }
}
