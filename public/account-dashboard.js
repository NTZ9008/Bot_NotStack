// My Account tab + ส่วนหัว (ชื่อ/role ผู้ใช้) + ซ่อนแท็บของ ADMIN จาก USER
// ใช้ window.currentUser ที่ auth-client.js โหลดไว้

const ROLE_LABELS = { ADMIN: 'ADMIN', USER: 'USER' };

const DISCORD_LINK_ERRORS = {
    discord_denied: 'คุณยกเลิกการเชื่อมต่อที่หน้า Discord',
    discord_state: 'ลิงก์เชื่อมต่อหมดอายุหรือไม่ถูกต้อง กรุณาลองใหม่',
    discord_failed: 'ติดต่อ Discord ไม่สำเร็จ กรุณาลองใหม่',
    discord_taken: 'บัญชี Discord นี้ถูกผูกกับผู้ใช้อื่นในระบบแล้ว',
    discord_disabled: 'ระบบยังไม่ได้เปิดใช้การเชื่อมต่อ Discord',
    account_disabled: 'บัญชีนี้ถูกปิดใช้งาน',
};

function formatDateTime(value) {
    return value ? new Date(value).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}

function avatarOf(user) {
    return user?.avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png';
}

document.addEventListener('DOMContentLoaded', async () => {
    const user = await window.authReady;
    if (!user) return;

    document.body.classList.toggle('role-admin', isAdmin());
    renderUserChip();

    const params = new URLSearchParams(location.search);
    const linked = params.get('discord') === 'linked';
    const linkError = params.get('discord_error');
    if (linked || linkError) {
        history.replaceState(null, '', '/');
        switchTab('account-tab');
        Swal.fire(linked
            ? { icon: 'success', title: 'เชื่อมต่อ Discord สำเร็จ', text: 'ต่อไปเข้าสู่ระบบด้วย Discord ได้เลย', confirmButtonColor: '#6366f1' }
            : { icon: 'error', title: 'เชื่อมต่อ Discord ไม่สำเร็จ', text: DISCORD_LINK_ERRORS[linkError] || 'เกิดข้อผิดพลาด', confirmButtonColor: '#6366f1' });
    } else if (!isAdmin()) {
        switchTab('levels-tab');
    }
});

function renderUserChip() {
    const user = window.currentUser;
    document.getElementById('user-chip-avatar').src = avatarOf(user);
    document.getElementById('user-chip-name').textContent = user.displayName;
    const badge = document.getElementById('user-chip-role');
    badge.textContent = ROLE_LABELS[user.role] || user.role;
    badge.className = `role-badge role-${user.role.toLowerCase()}`;
    document.getElementById('user-chip').classList.remove('hidden');
}

async function reloadCurrentUser() {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return;
    const data = await res.json();
    window.currentUser = data.user;
    renderUserChip();
    renderAccount();
}

// ==========================================
// My Account
// ==========================================
async function renderAccount() {
    const user = window.currentUser;
    const container = document.getElementById('account-content');
    if (!user || !container) return;

    const roleClass = `role-badge role-${user.role.toLowerCase()}`;
    const discordPanel = user.discordId
        ? `
            <p>เชื่อมต่อกับ <strong>@${escapeHtml(user.discordUsername)}</strong> แล้ว — เข้าสู่ระบบด้วยปุ่ม Discord ได้</p>
            ${user.hasPassword
                ? '<button type="button" class="btn-danger-outline" onclick="unlinkDiscord()">ยกเลิกการเชื่อมต่อ</button>'
                : '<p class="prbot-hint">บัญชีนี้ไม่มีรหัสผ่าน จึงยกเลิกการเชื่อมต่อไม่ได้ (จะไม่เหลือช่องทางเข้าสู่ระบบ)</p>'}`
        : window.discordLoginEnabled
            ? `
            <p>ผูกบัญชี Discord เพื่อให้เข้าสู่ระบบได้ด้วยปุ่ม Discord โดยไม่ต้องพิมพ์รหัสผ่าน</p>
            <a class="btn-discord-sm" href="/api/auth/discord/link">เชื่อมต่อบัญชี Discord</a>`
            : '<p class="prbot-hint">ผู้ดูแลระบบยังไม่ได้ตั้งค่า Discord OAuth</p>';

    const passwordPanel = user.hasPassword
        ? `
            <form class="account-form" onsubmit="changePassword(event)">
                <input type="password" id="pw-current" placeholder="รหัสผ่านปัจจุบัน" autocomplete="current-password" required>
                <input type="password" id="pw-new" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" autocomplete="new-password" minlength="8" required>
                <input type="password" id="pw-confirm" placeholder="ยืนยันรหัสผ่านใหม่" autocomplete="new-password" minlength="8" required>
                <button type="submit">เปลี่ยนรหัสผ่าน</button>
            </form>
            <p class="prbot-hint">อุปกรณ์อื่นที่เข้าสู่ระบบค้างไว้จะถูกออกจากระบบทันที</p>`
        : '<p class="prbot-hint">บัญชีนี้เข้าสู่ระบบด้วย Discord เท่านั้น — ถ้าต้องการใช้รหัสผ่าน ให้ผู้ดูแลระบบตั้ง username/รหัสผ่านให้ในหน้า Users</p>';

    container.innerHTML = `
        <div class="account-panel">
            <h3>โปรไฟล์</h3>
            <div class="account-profile">
                <img src="${escapeHtml(avatarOf(user))}" alt="">
                <div>
                    <strong>${escapeHtml(user.displayName)}</strong>
                    <span class="${roleClass}">${escapeHtml(ROLE_LABELS[user.role] || user.role)}</span>
                    <div class="account-meta">username: ${user.username ? escapeHtml(user.username) : '—'}</div>
                    <div class="account-meta">สมัครเมื่อ ${formatDateTime(user.createdAt)}</div>
                    <div class="account-meta">เข้าสู่ระบบล่าสุด ${formatDateTime(user.lastLoginAt)}</div>
                </div>
            </div>
            <div id="account-level" class="account-level hidden"></div>
        </div>

        <div class="account-panel">
            <h3>Discord</h3>
            ${discordPanel}
        </div>

        <div class="account-panel">
            <h3>รหัสผ่าน</h3>
            ${passwordPanel}
        </div>

        <div class="account-panel">
            <h3>Sessions</h3>
            <p>ลืมออกจากระบบที่เครื่องอื่น หรือสงสัยว่ามีคนแอบใช้บัญชี? ออกจากระบบทุกอุปกรณ์ได้ที่นี่ (รวมเครื่องนี้)</p>
            <button type="button" class="btn-danger-outline" onclick="logoutAllDevices()">ออกจากระบบทุกอุปกรณ์</button>
        </div>
    `;

    if (user.discordId) renderMyLevel(user.discordId);
}

async function renderMyLevel(discordId) {
    try {
        const levels = await fetch('/api/levels').then(r => r.json());
        const index = levels.findIndex(l => l.userId === discordId);
        const el = document.getElementById('account-level');
        if (index === -1 || !el) return;
        const me = levels[index];
        el.innerHTML = `
            <div><span>อันดับ</span><strong>#${index + 1}</strong></div>
            <div><span>Level</span><strong>${me.level}</strong></div>
            <div><span>XP</span><strong>${me.xp.toLocaleString()}</strong></div>`;
        el.classList.remove('hidden');
    } catch (e) {}
}

async function postJson(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
}

async function changePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('pw-current').value;
    const newPassword = document.getElementById('pw-new').value;
    if (newPassword !== document.getElementById('pw-confirm').value) {
        return Swal.fire({ icon: 'warning', title: 'รหัสผ่านใหม่ไม่ตรงกัน', confirmButtonColor: '#6366f1' });
    }
    const { ok, data } = await postJson('/api/auth/password', { currentPassword, newPassword });
    if (!ok) return Swal.fire({ icon: 'error', title: 'เปลี่ยนรหัสผ่านไม่สำเร็จ', text: data.error, confirmButtonColor: '#6366f1' });
    event.target.reset();
    Swal.fire({ icon: 'success', title: 'เปลี่ยนรหัสผ่านแล้ว', text: 'อุปกรณ์อื่นถูกออกจากระบบเรียบร้อย', confirmButtonColor: '#6366f1' });
}

async function unlinkDiscord() {
    const confirm = await Swal.fire({
        title: 'ยกเลิกการเชื่อมต่อ Discord?',
        text: 'หลังจากนี้ต้องเข้าสู่ระบบด้วย username/รหัสผ่านเท่านั้น',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยกเลิกการเชื่อมต่อ',
        cancelButtonText: 'ไม่ใช่ตอนนี้'
    });
    if (!confirm.isConfirmed) return;
    const { ok, data } = await postJson('/api/auth/discord/unlink');
    if (!ok) return Swal.fire({ icon: 'error', title: 'ไม่สำเร็จ', text: data.error, confirmButtonColor: '#6366f1' });
    showToast('ยกเลิกการเชื่อมต่อ Discord แล้ว');
    reloadCurrentUser();
}

async function logoutAllDevices() {
    const confirm = await Swal.fire({
        title: 'ออกจากระบบทุกอุปกรณ์?',
        text: 'ทุกเครื่องที่เข้าสู่ระบบบัญชีนี้อยู่ (รวมเครื่องนี้) จะต้องเข้าสู่ระบบใหม่',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบทั้งหมด',
        cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;
    await postJson('/api/auth/logout-all');
    location.href = '/login';
}
