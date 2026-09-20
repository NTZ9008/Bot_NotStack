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
        tbody.innerHTML = `<tr><td colspan="7" class="cell-center cell-error">${escapeHtml(err.message)}</td></tr>`;
    }
}

function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    if (adminUsers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="cell-center">ยังไม่มีผู้ใช้</td></tr>';
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
        tbody.innerHTML = '<tr><td colspan="7" class="cell-center">Loading...</td></tr>';
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
        else tbody.innerHTML = rows || '<tr><td colspan="7" class="cell-center">ไม่พบรายการ</td></tr>';
        data.items.forEach(item => { auditItems.set(item.id, item); });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="cell-center cell-error">${escapeHtml(err.message)}</td></tr>`;
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

// ==========================================
// 🛰️ ACTIVITY LOG — เหตุการณ์ในเซิร์ฟเวอร์ Discord (ตาราง activity_events)
// ==========================================
let activityCursor = null;
let activityTypesLoaded = false;
const activityItems = new Map(); // id → รายการ (ใช้ตอนกดดูรายละเอียด)

// เปิดแท็บ Audit Logs — โหลดเฉพาะมุมมองที่กำลังแสดงอยู่
function loadAuditTab() {
    const discordVisible = !document.getElementById('audit-source-discord').classList.contains('hidden');
    if (discordVisible) loadActivityLogs();
    else loadAuditLogs();
}

function switchAuditSource(source) {
    const isDiscord = source === 'discord';
    document.querySelectorAll('#audit-source button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.source === source);
    });
    document.getElementById('audit-source-dashboard').classList.toggle('hidden', isDiscord);
    document.getElementById('audit-source-discord').classList.toggle('hidden', !isDiscord);
    if (isDiscord) loadActivityLogs();
    else loadAuditLogs();
}

// รายการชนิดเหตุการณ์ + ช่วงข้อมูลที่เก็บไว้ (โหลดครั้งเดียวพอ)
async function loadActivityMeta() {
    if (activityTypesLoaded) return;
    try {
        const meta = await adminRequest('GET', '/api/admin/activity/meta');
        activityTypesLoaded = true;

        const groups = new Map();
        for (const type of meta.eventTypes) {
            if (!groups.has(type.group)) groups.set(type.group, []);
            groups.get(type.group).push(type);
        }
        document.getElementById('activity-event').innerHTML = '<option value="">ทุกเหตุการณ์</option>'
            + [...groups.entries()].map(([group, types]) =>
                `<optgroup label="${escapeHtml(group)}">${types.map(t =>
                    `<option value="${escapeHtml(t.key)}">${escapeHtml(t.label)}</option>`).join('')}</optgroup>`).join('');

        const status = meta.enabled ? 'กำลังบันทึกอยู่' : '⚠️ ปิดการบันทึกอยู่ (เปิดได้ที่แท็บ Log Management)';
        const since = meta.since ? `เริ่มเก็บตั้งแต่ ${formatDateTime(meta.since)}` : 'ยังไม่มีข้อมูล';
        document.getElementById('activity-meta').textContent =
            `${status} · ${since} · ทั้งหมด ${Number(meta.total).toLocaleString('th-TH')} รายการ · เก็บย้อนหลัง ${meta.retentionDays} วัน`;
    } catch (err) {
        document.getElementById('activity-meta').textContent = `โหลดข้อมูลไม่สำเร็จ: ${err.message}`;
    }
}

async function loadActivityLogs(append = false) {
    const tbody = document.getElementById('activity-tbody');
    const moreBtn = document.getElementById('activity-more');
    if (!append) {
        activityCursor = null;
        loadActivityMeta();
        tbody.innerHTML = '<tr><td colspan="7" class="cell-center">Loading...</td></tr>';
    }

    const params = new URLSearchParams({ limit: '50' });
    const eventKey = document.getElementById('activity-event').value;
    const hours = Number(document.getElementById('activity-range').value);
    const q = document.getElementById('activity-q').value.trim();
    if (eventKey) params.set('eventKey', eventKey);
    if (hours) params.set('from', new Date(Date.now() - hours * 3600000).toISOString());
    if (q) params.set('q', q);
    if (document.getElementById('activity-include-bots').checked) params.set('includeBots', 'true');
    if (append && activityCursor) params.set('cursor', activityCursor);

    try {
        const data = await adminRequest('GET', `/api/admin/activity?${params}`);
        activityCursor = data.nextCursor;
        moreBtn.classList.toggle('hidden', !data.nextCursor);

        const rows = data.items.map(renderActivityRow).join('');
        if (append) tbody.insertAdjacentHTML('beforeend', rows);
        else tbody.innerHTML = rows || '<tr><td colspan="7" class="cell-center">ไม่พบเหตุการณ์ในช่วงเวลานี้</td></tr>';
        data.items.forEach(item => { activityItems.set(item.id, item); });
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="cell-center cell-error">${escapeHtml(err.message)}</td></tr>`;
    }
}

// สีของป้ายชนิดเหตุการณ์ อิงจากหมวดของ Log Manager
const ACTIVITY_GROUP_CLASS = {
    'สมาชิก': 'audit-user',
    'ข้อความ': 'audit-auth',
    'ช่อง & เธรด': 'audit-config',
    'บทบาท & เซิร์ฟเวอร์': 'audit-config',
    'ห้องเสียง': 'audit-voice',
    'ความปลอดภัย & AutoMod': 'audit-news',
};

function renderActivityRow(item) {
    const groupClass = ACTIVITY_GROUP_CLASS[item.group] || 'audit-user';
    return `
        <tr>
            <td><small>${escapeHtml(formatDateTime(item.createdAt))}</small></td>
            <td>
                <span class="audit-action ${groupClass}">${escapeHtml(item.label)}</span>
                <div class="audit-code">${escapeHtml(item.eventKey)}</div>
            </td>
            <td>
                ${item.userName ? `<strong>${escapeHtml(item.userName)}</strong>` : '<span class="muted">—</span>'}
                ${item.isBot ? '<span class="status-badge status-self">BOT</span>' : ''}
                ${item.userId ? `<div class="audit-code">${escapeHtml(item.userId)}</div>` : ''}
            </td>
            <td><small>${item.channelName ? `#${escapeHtml(item.channelName)}` : '<span class="muted">—</span>'}</small></td>
            <td><small>${item.executorName ? escapeHtml(item.executorName) : '<span class="muted">—</span>'}</small></td>
            <td><small>${escapeHtml(item.summary || '—')}</small></td>
            <td><button type="button" class="btn-sm" onclick="showActivityDetail(${item.id})">ดู</button></td>
        </tr>`;
}

function showActivityDetail(id) {
    const item = activityItems.get(id);
    if (!item) return;
    const fields = item.metadata?.fields || [];
    const rest = { ...(item.metadata || {}) };
    delete rest.fields;

    Swal.fire({
        title: escapeHtml(item.label),
        html: `
            <div class="audit-detail">
                <div><span>เวลา</span>${escapeHtml(formatDateTime(item.createdAt))}</div>
                <div><span>เหตุการณ์</span><code>${escapeHtml(item.eventKey)}</code></div>
                <div><span>ผู้ใช้</span>${escapeHtml(item.userName || '—')}${item.userId ? ` (${escapeHtml(item.userId)})` : ''}</div>
                <div><span>ห้อง</span>${item.channelName ? `#${escapeHtml(item.channelName)}` : '—'}</div>
                <div><span>ผู้ลงมือ</span>${escapeHtml(item.executorName || '—')}</div>
                <div><span>รายละเอียด</span>${escapeHtml(item.summary || '—')}</div>
                ${fields.map(f => `<div><span>${escapeHtml(f.name)}</span>${escapeHtml(f.value)}</div>`).join('')}
                ${Object.keys(rest).length ? `<pre>${escapeHtml(JSON.stringify(rest, null, 2))}</pre>` : ''}
            </div>`,
        width: 640,
        confirmButtonColor: '#6366f1',
        confirmButtonText: 'ปิด'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const q = document.getElementById('activity-q');
    if (q) q.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadActivityLogs(); });
    const range = document.getElementById('activity-range');
    if (range) range.addEventListener('change', () => loadActivityLogs());
    const eventSelect = document.getElementById('activity-event');
    if (eventSelect) eventSelect.addEventListener('change', () => loadActivityLogs());
    const bots = document.getElementById('activity-include-bots');
    if (bots) bots.addEventListener('change', () => loadActivityLogs());
});
