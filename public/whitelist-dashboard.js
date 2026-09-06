let vgMode = 'whitelist';
let vgData = [];
let vgSearchTimer = null;

function apiBase() {
    return vgMode === 'whitelist' ? '/api/whitelist' : '/api/blacklist';
}

function switchVGMode(mode) {
    vgMode = mode;
    document.getElementById('vg-mode-wl').classList.toggle('vg-mode-active', mode === 'whitelist');
    document.getElementById('vg-mode-bl').classList.toggle('vg-mode-active', mode === 'blacklist');
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
            html += `<option value="${ch.id}">${ch.name}</option>`;
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
        container.innerHTML = `<p style="text-align: center; color: var(--text-secondary); padding: 2rem 0;">ยังไม่มีห้องใน ${modeLabel}</p>`;
        return;
    }

    let html = '';
    vgData.forEach(ch => {
        const cardClass = vgMode === 'blacklist' ? 'vg-card vg-card-bl' : 'vg-card';
        const toggleChecked = ch.enabled ? 'checked' : '';

        html += `
        <div class="${cardClass}" id="vg-card-${ch.channelId}">
            <div class="vg-card-head">
                <div class="vg-card-title">${ch.channelName}</div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <label class="switch">
                        <input type="checkbox" ${toggleChecked} onchange="toggleVGChannel('${ch.channelId}', this.checked)">
                        <span class="slider"></span>
                    </label>
                    <button class="prbot-remove-btn" onclick="deleteVGChannel('${ch.channelId}')">X</button>
                </div>
            </div>

            <div class="vg-search-wrap">
                <input type="text" class="input-select vg-search-input" placeholder="ค้นหาชื่อสมาชิก..." oninput="onVGSearch(this, '${ch.channelId}')">
                <div class="vg-search-dropdown" id="vg-dropdown-${ch.channelId}"></div>
            </div>

            <div class="vg-users" id="vg-users-${ch.channelId}">
                ${renderVGUsers(ch.channelId, ch.users)}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

function renderVGUsers(channelId, users) {
    if (!users || users.length === 0) {
        return '<p style="color: var(--text-secondary); font-size: 0.85rem;">ยังไม่มีสมาชิก</p>';
    }

    return users.map(u => `
        <div class="vg-user" id="vg-user-${channelId}-${u.userId}">
            <img class="vg-user-avatar" src="${u.avatar}" alt="">
            <div class="vg-user-info">
                <div class="vg-user-name">${u.username}</div>
                <div class="vg-user-id">${u.userId}</div>
            </div>
            <button class="vg-user-remove" onclick="removeVGUser('${channelId}', '${u.userId}')">X</button>
        </div>
    `).join('');
}

function onVGSearch(input, channelId) {
    clearTimeout(vgSearchTimer);
    const query = input.value.trim();
    const dropdown = document.getElementById(`vg-dropdown-${channelId}`);

    if (!query || query.length < 1) {
        dropdown.innerHTML = '';
        dropdown.style.display = 'none';
        return;
    }

    vgSearchTimer = setTimeout(async () => {
        try {
            const res = await fetch(`/api/search-members?q=${encodeURIComponent(query)}`);
            const members = await res.json();

            const chData = vgData.find(c => c.channelId === channelId);
            const existingIds = chData ? chData.users.map(u => u.userId) : [];
            const filtered = members.filter(m => !existingIds.includes(m.userId));

            if (filtered.length === 0) {
                dropdown.innerHTML = '<div class="vg-search-empty">ไม่พบสมาชิก</div>';
                dropdown.style.display = 'block';
                return;
            }

            dropdown.innerHTML = filtered.map(m => `
                <div class="vg-search-item" onclick="selectVGMember('${channelId}', '${m.userId}', this)">
                    <img src="${m.avatar}" alt="" class="vg-search-avatar">
                    <div>
                        <div class="vg-search-name">${m.username}${m.nickname ? ` (${m.nickname})` : ''}</div>
                        <div class="vg-search-tag">@${m.tag}</div>
                    </div>
                </div>
            `).join('');
            dropdown.style.display = 'block';
        } catch (e) {
            console.error('Search error:', e);
        }
    }, 300);
}

async function selectVGMember(channelId, userId, el) {
    const dropdown = el.closest('.vg-search-dropdown');
    dropdown.style.display = 'none';
    const searchInput = dropdown.previousElementSibling;
    searchInput.value = '';

    try {
        const res = await fetch(`${apiBase()}/user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, userId })
        });
        const result = await res.json();
        if (result.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'เพิ่มสมาชิกสำเร็จ', showConfirmButton: false, timer: 2000, timerProgressBar: true });
            await loadVGData();
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: e.message });
    }
}

async function addVGChannel() {
    const select = document.getElementById('vg-channel-select');
    const channelId = select.value;
    if (!channelId) {
        Swal.fire({ icon: 'warning', title: 'เลือกห้องก่อน', text: 'กรุณาเลือกห้องเสียงจาก dropdown' });
        return;
    }

    try {
        const res = await fetch(`${apiBase()}/channel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId })
        });
        const result = await res.json();
        if (result.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'เพิ่มห้องสำเร็จ', showConfirmButton: false, timer: 2000, timerProgressBar: true });
            select.value = '';
            await loadVGData();
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: e.message });
    }
}

async function toggleVGChannel(channelId, enabled) {
    try {
        await fetch(`${apiBase()}/channel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId, enabled: enabled ? 1 : 0 })
        });
    } catch (e) {
        console.error('Toggle error:', e);
    }
}

async function deleteVGChannel(channelId) {
    const confirmResult = await Swal.fire({
        title: 'ยืนยันลบห้อง?',
        text: 'สมาชิกทั้งหมดในห้องนี้จะถูกลบด้วย',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (!confirmResult.isConfirmed) return;

    try {
        const res = await fetch(`${apiBase()}/channel/${channelId}`, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ลบห้องสำเร็จ', showConfirmButton: false, timer: 2000, timerProgressBar: true });
            await loadVGData();
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: e.message });
    }
}

async function removeVGUser(channelId, userId) {
    try {
        const res = await fetch(`${apiBase()}/user`, {
            method: 'DELETE',
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

document.addEventListener('click', (e) => {
    if (!e.target.closest('.vg-search-wrap')) {
        document.querySelectorAll('.vg-search-dropdown').forEach(d => d.style.display = 'none');
    }
});
