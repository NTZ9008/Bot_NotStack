// Users tab + Audit Logs tab (ADMIN เท่านั้น — ฝั่ง server ตรวจสิทธิ์ซ้ำทุก request)

// ==========================================
// 👥 USERS
// ==========================================
let adminUsers = [];

async function adminRequest(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
}

function showError(title, err) {
    Swal.fire({ icon: 'error', title, text: err.message, confirmButtonColor: '#6366f1' });
}

// title ของ SweetAlert แสดงเป็น HTML → ต้อง escape (อาจมีชื่อผู้ใช้จาก Discord อยู่ในนั้น)
async function confirmAction(title, text, confirmButtonText, danger = true) {
    const result = await Swal.fire({
        title: escapeHtml(title),
        text,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: danger ? '#ef4444' : '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText,
        cancelButtonText: 'ยกเลิก'
    });
    return result.isConfirmed;
}

async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    try {
        adminUsers = await adminRequest('GET', '/api/admin/users');
        renderUsers();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    if (adminUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">ยังไม่มีผู้ใช้</td></tr>';
        return;
    }

    tbody.innerHTML = adminUsers.map(u => {
        const methods = [
            u.hasPassword ? `<span class="login-method">🔑 ${escapeHtml(u.username)}</span>` : '',
            u.discordId ? `<span class="login-method login-method-discord">Discord @${escapeHtml(u.discordUsername)}</span>` : '',
        ].join('');
        const locked = u.lockedUntil
            ? `<span class="status-badge status-locked" title="ล็อกถึง ${escapeHtml(formatDateTime(u.lockedUntil))}">ล็อกชั่วคราว</span>`
            : '';
        const self = u.isSelf ? '<span class="status-badge status-self">คุณ</span>' : '';

        return `
            <tr class="${u.isActive ? '' : 'user-row-disabled'}">
                <td>
                    <div class="user-cell">
                        <img src="${escapeHtml(avatarOf(u))}" alt="">
                        <div>
                            <strong>${escapeHtml(u.displayName)}</strong> ${self}<br>
                            <small>#${u.id} · สมัคร ${escapeHtml(formatDateTime(u.createdAt))}</small>
                        </div>
                    </div>
                </td>
                <td><div class="login-methods">${methods}</div></td>
                <td>
                    <select class="input-select role-select" onchange="changeUserRole(${u.id}, this)" ${u.isSelf ? 'disabled title="เปลี่ยน role ของตัวเองไม่ได้"' : ''}>
                        <option value="USER" ${u.role === 'USER' ? 'selected' : ''}>USER</option>
                        <option value="ADMIN" ${u.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                    </select>
                </td>
                <td>
                    <div class="user-status">
                        <label class="switch" title="${u.isActive ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}">
                            <input type="checkbox" ${u.isActive ? 'checked' : ''} ${u.isSelf ? 'disabled' : ''} onchange="toggleUserActive(${u.id}, this)">
                            <span class="slider"></span>
                        </label>
                        ${locked}
                    </div>
                </td>
                <td>${u.activeSessions}</td>
                <td><small>${escapeHtml(formatDateTime(u.lastLoginAt))}</small></td>
                <td>
                    <div class="user-actions">
                        <button type="button" class="btn-sm" onclick="setUserPassword(${u.id})">ตั้งรหัสผ่าน</button>
                        ${u.lockedUntil ? `<button type="button" class="btn-sm" onclick="unlockUser(${u.id})">ปลดล็อก</button>` : ''}
                        <button type="button" class="btn-sm btn-sm-warn" onclick="revokeUserSessions(${u.id})">เตะออกทุกเครื่อง</button>
                        ${u.isSelf ? '' : `<button type="button" class="btn-sm btn-sm-danger" onclick="deleteUser(${u.id})">ลบ</button>`}
                    </div>
                </td>
            </tr>`;
    }).join('');
}

const findAdminUser = (id) => adminUsers.find(u => u.id === id);

async function createUser() {
    const username = document.getElementById('new-user-username').value.trim();
    const password = document.getElementById('new-user-password').value;
    const displayName = document.getElementById('new-user-display').value.trim();
    const role = document.getElementById('new-user-role').value;
    if (!username || !password) {
        return Swal.fire({ icon: 'warning', title: 'กรุณากรอก username และรหัสผ่าน', confirmButtonColor: '#6366f1' });
    }
    try {
        await adminRequest('POST', '/api/admin/users', { username, password, displayName, role });
        ['new-user-username', 'new-user-password', 'new-user-display'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('new-user-role').value = 'USER';
        showToast(`เพิ่มผู้ใช้ ${username} แล้ว`);
        loadUsers();
    } catch (err) {
        showError('เพิ่มผู้ใช้ไม่สำเร็จ', err);
    }
}

async function changeUserRole(id, select) {
    const user = findAdminUser(id);
    const role = select.value;
    const ok = await confirmAction(
        `เปลี่ยน role เป็น ${role}?`,
        role === 'ADMIN'
            ? `${user.displayName} จะเข้าถึงทุกเมนู รวมถึงจัดการผู้ใช้และตั้งค่าบอทได้`
            : `${user.displayName} จะเหลือสิทธิ์ดูแค่ Levels และบัญชีตัวเอง`,
        'เปลี่ยน role',
        role === 'ADMIN'
    );
    if (!ok) {
        select.value = user.role;
        return;
    }
    try {
        await adminRequest('PATCH', `/api/admin/users/${id}`, { role });
        showToast('เปลี่ยน role แล้ว');
    } catch (err) {
        showError('เปลี่ยน role ไม่สำเร็จ', err);
    }
    loadUsers();
}

async function toggleUserActive(id, checkbox) {
    const user = findAdminUser(id);
    const isActive = checkbox.checked;
    if (!isActive) {
        const ok = await confirmAction('ปิดใช้งานบัญชีนี้?', `${user.displayName} จะถูกออกจากระบบทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใหม่`, 'ปิดใช้งาน');
        if (!ok) {
            checkbox.checked = true;
            return;
        }
    }
    try {
        await adminRequest('PATCH', `/api/admin/users/${id}`, { isActive });
        showToast(isActive ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดใช้งานบัญชีแล้ว');
    } catch (err) {
        showError('ไม่สำเร็จ', err);
    }
    loadUsers();
}

async function setUserPassword(id) {
    const user = findAdminUser(id);
    const needsUsername = !user.username;
    const result = await Swal.fire({
        title: `ตั้งรหัสผ่านให้ ${escapeHtml(user.displayName)}`,
        html: `
            ${needsUsername ? '<p class="swal-hint">บัญชีนี้มาจาก Discord — ต้องกำหนด username สำหรับเข้าสู่ระบบด้วยรหัสผ่านด้วย</p><input id="swal-username" class="swal2-input" placeholder="username (a-z 0-9 _ . -)" autocomplete="off">' : ''}
            <input id="swal-password" type="password" class="swal2-input" placeholder="รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)" autocomplete="new-password">
            <p class="swal-hint">ผู้ใช้จะถูกออกจากระบบทุกเครื่อง แล้วต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านนี้</p>`,
        showCancelButton: true,
        confirmButtonColor: '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'บันทึก',
        cancelButtonText: 'ยกเลิก',
        preConfirm: () => {
            const body = { password: document.getElementById('swal-password').value };
            if (needsUsername) body.username = document.getElementById('swal-username').value.trim();
            return body;
        }
    });
    if (!result.isConfirmed) return;
    try {
        await adminRequest('PATCH', `/api/admin/users/${id}`, result.value);
        showToast('ตั้งรหัสผ่านแล้ว');
        loadUsers();
    } catch (err) {
        showError('ตั้งรหัสผ่านไม่สำเร็จ', err);
    }
}

async function unlockUser(id) {
    try {
        await adminRequest('PATCH', `/api/admin/users/${id}`, { unlock: true });
        showToast('ปลดล็อกบัญชีแล้ว');
        loadUsers();
    } catch (err) {
        showError('ปลดล็อกไม่สำเร็จ', err);
    }
}

async function revokeUserSessions(id) {
    const user = findAdminUser(id);
    const text = user.isSelf
        ? 'รวมเครื่องนี้ด้วย — คุณจะต้องเข้าสู่ระบบใหม่'
        : `${user.displayName} จะถูกออกจากระบบทุกอุปกรณ์ทันที`;
    if (!(await confirmAction('บังคับออกจากระบบทุกเครื่อง?', text, 'ออกจากระบบทั้งหมด'))) return;
    try {
        const data = await adminRequest('POST', `/api/admin/users/${id}/revoke-sessions`);
        if (user.isSelf) return (location.href = '/login');
        showToast(`ออกจากระบบแล้ว ${data.revoked} session`);
        loadUsers();
    } catch (err) {
        showError('ไม่สำเร็จ', err);
    }
}

async function deleteUser(id) {
    const user = findAdminUser(id);
    const ok = await confirmAction(
        `ลบผู้ใช้ ${user.displayName}?`,
        'ลบถาวร กู้คืนไม่ได้ (ประวัติใน Audit Logs ยังอยู่) — ถ้าแค่ไม่อยากให้เข้าระบบ แนะนำให้ปิดใช้งานแทน',
        'ลบผู้ใช้'
    );
    if (!ok) return;
    try {
        await adminRequest('DELETE', `/api/admin/users/${id}`);
        showToast('ลบผู้ใช้แล้ว');
        loadUsers();
    } catch (err) {
        showError('ลบผู้ใช้ไม่สำเร็จ', err);
    }
}

// ==========================================
// 📜 AUDIT LOGS
// ==========================================
const AUDIT_ACTION_LABELS = {
    'auth.login': 'เข้าสู่ระบบ',
    'auth.login_failed': 'เข้าสู่ระบบไม่สำเร็จ',
    'auth.logout': 'ออกจากระบบ',
    'auth.logout_all': 'ออกจากระบบทุกอุปกรณ์',
    'auth.account_locked': 'บัญชีถูกล็อก',
    'auth.refresh_reuse_detected': 'ตรวจพบ session ถูกขโมย/ใช้ซ้ำ',
    'auth.password_change': 'เปลี่ยนรหัสผ่าน',
    'auth.discord_register': 'สมัครผ่าน Discord',
    'auth.discord_link': 'เชื่อมต่อ Discord',
    'auth.discord_unlink': 'ยกเลิกเชื่อมต่อ Discord',
    'user.create': 'เพิ่มผู้ใช้',
    'user.update': 'แก้ไขผู้ใช้',
    'user.delete': 'ลบผู้ใช้',
    'user.sessions_revoke': 'บังคับออกจากระบบ',
    'config.update': 'แก้ไข Configuration',
    'news.send': 'ส่งประกาศข่าว',
    'room_access.change': 'สิทธิ์เข้าห้อง',
};

const AUDIT_GROUP_LABELS = {
    auth: 'การเข้าสู่ระบบ',
    user: 'จัดการผู้ใช้',
    config: 'Configuration',
    news: 'ประกาศข่าว',
    room_access: 'Room Access',
    voice_guard: 'Voice Guard',
    log_settings: 'Log Management',
};

let auditCursor = null;
const auditItems = new Map(); // id → รายการ (ใช้ตอนกดดูรายละเอียด)

function auditLabel(action) {
    if (AUDIT_ACTION_LABELS[action]) return AUDIT_ACTION_LABELS[action];
    const group = action.split('.')[0];
    return AUDIT_GROUP_LABELS[group] || action;
}

async function loadAuditActions() {
    const select = document.getElementById('audit-action');
    try {
        const actions = await adminRequest('GET', '/api/admin/audit-logs/actions');
        const current = select.value;
        const groups = [...new Set(actions.map(a => a.split('.')[0]))];
        select.innerHTML = '<option value="">ทุก action</option>'
            + `<optgroup label="ทั้งหมวด">${groups.map(g => `<option value="${escapeHtml(g)}.">${escapeHtml(AUDIT_GROUP_LABELS[g] || g)} (ทั้งหมด)</option>`).join('')}</optgroup>`
            + `<optgroup label="แยก action">${actions.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(auditLabel(a))} — ${escapeHtml(a)}</option>`).join('')}</optgroup>`;
        select.value = current;
    } catch (e) {}
}

async function loadAuditLogs(append = false) {
    const tbody = document.getElementById('audit-tbody');
    const moreBtn = document.getElementById('audit-more');
    if (!append) {
        auditCursor = null;
        loadAuditActions();
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Loading...</td></tr>';
    }

    const params = new URLSearchParams({ limit: '50' });
    const action = document.getElementById('audit-action').value;
    const success = document.getElementById('audit-success').value;
    const q = document.getElementById('audit-q').value.trim();
    if (action) params.set('action', action);
    if (success) params.set('success', success);
    if (q) params.set('q', q);
    if (append && auditCursor) params.set('cursor', auditCursor);

    try {
        const data = await adminRequest('GET', `/api/admin/audit-logs?${params}`);
        auditCursor = data.nextCursor;
        moreBtn.classList.toggle('hidden', !data.nextCursor);

        const rows = data.items.map(renderAuditRow).join('');
        if (append) tbody.insertAdjacentHTML('beforeend', rows);
        else tbody.innerHTML = rows || '<tr><td colspan="7" style="text-align: center;">ไม่พบรายการ</td></tr>';
        data.items.forEach(item => { auditItems.set(item.id, item); });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderAuditRow(item) {
    const group = item.action.split('.')[0];
    const target = item.targetId ? `${item.targetType ? `${item.targetType}: ` : ''}${item.targetId}` : '—';
    return `
        <tr>
            <td><small>${escapeHtml(formatDateTime(item.createdAt))}</small></td>
            <td>${item.actorName ? escapeHtml(item.actorName) : '<span class="muted">ไม่ทราบ</span>'}</td>
            <td>
                <span class="audit-action audit-${escapeHtml(group)}">${escapeHtml(auditLabel(item.action))}</span>
                <div class="audit-code">${escapeHtml(item.action)}</div>
            </td>
            <td><small>${escapeHtml(target)}</small></td>
            <td><small class="mono">${escapeHtml(item.ip || '—')}</small></td>
            <td>${item.success ? '<span class="status-badge status-ok">สำเร็จ</span>' : '<span class="status-badge status-fail">ไม่สำเร็จ</span>'}</td>
            <td><button type="button" class="btn-sm" onclick="showAuditDetail(${item.id})">ดู</button></td>
        </tr>`;
}

function showAuditDetail(id) {
    const item = auditItems.get(id);
    if (!item) return;
    Swal.fire({
        title: escapeHtml(auditLabel(item.action)),
        html: `
            <div class="audit-detail">
                <div><span>เวลา</span>${escapeHtml(formatDateTime(item.createdAt))}</div>
                <div><span>ผู้กระทำ</span>${escapeHtml(item.actorName || 'ไม่ทราบ')}${item.actorId ? ` (#${item.actorId})` : ''}</div>
                <div><span>Action</span><code>${escapeHtml(item.action)}</code></div>
                <div><span>IP</span>${escapeHtml(item.ip || '—')}</div>
                <div><span>User-Agent</span>${escapeHtml(item.userAgent || '—')}</div>
                <pre>${escapeHtml(JSON.stringify(item.metadata, null, 2) || '—')}</pre>
            </div>`,
        width: 640,
        confirmButtonColor: '#6366f1',
        confirmButtonText: 'ปิด'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const q = document.getElementById('audit-q');
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadAuditLogs(); });
});
