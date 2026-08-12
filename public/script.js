document.addEventListener('DOMContentLoaded', () => {
    fetchConfig();
    fetchLogsList();
    fetchLevels();
    fetchRoomAccessList();
    
    // Populate Time Dropdowns
    const hoursSelect = document.getElementById('access-hours');
    const minutesSelect = document.getElementById('access-minutes');
    const secondsSelect = document.getElementById('access-seconds');
    if (hoursSelect && minutesSelect && secondsSelect) {
        for (let i = 0; i <= 72; i++) {
            hoursSelect.innerHTML += `<option value="${i}">${i.toString().padStart(2, '0')} ชม.</option>`;
        }
        for (let i = 0; i < 60; i++) {
            const opt = `<option value="${i}">${i.toString().padStart(2, '0')} นาที</option>`;
            minutesSelect.innerHTML += opt;
        }
        for (let i = 0; i < 60; i++) {
            const opt = `<option value="${i}">${i.toString().padStart(2, '0')} วิ</option>`;
            secondsSelect.innerHTML += opt;
        }
    }
});

// --- Tab Navigation ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.remove('hidden');
    
    if (tabId === 'access-tab') {
        fetchRoomAccessList();
    }
}

// --- Config Methods ---
async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        const configs = await response.json();
        
        document.getElementById('loading').classList.add('hidden');
        const formContainer = document.getElementById('config-form');
        formContainer.classList.remove('hidden');
        
        let html = '';
        configs.forEach((config, index) => {
            html += `
                <div class="form-group" style="animation-delay: ${index * 0.1}s">
                    <label for="${config.key}">${config.key}</label>
                    <span class="desc">${config.description}</span>
                    <div class="input-wrapper">
                        <input type="text" id="${config.key}" value="${config.value}" placeholder="Enter Channel ID">
                        <button onclick="updateConfig('${config.key}')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                                <polyline points="7 3 7 8 15 8"></polyline>
                            </svg>
                            Save
                        </button>
                    </div>
                </div>
            `;
        });
        
        formContainer.innerHTML = html;
        
    } catch (error) {
        console.error('Error fetching configs:', error);
        document.getElementById('loading').innerHTML = '<p style="color: #ef4444;">Error loading configuration. Is the server running?</p>';
    }
}

async function updateConfig(key) {
    const inputElement = document.getElementById(key);
    const newValue = inputElement.value.trim();
    const button = inputElement.nextElementSibling;
    
    if (!newValue) return;
    
    // UI Loading state
    const originalText = button.innerHTML;
    button.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0; border-width: 2px;"></div>';
    button.disabled = true;
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ key, value: newValue })
        });
        
        const result = await response.json();
        
        if (result.success) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'บันทึกสำเร็จ!',
                text: `อัปเดตค่า ${key} แล้ว`,
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });
            button.innerHTML = originalText;
            button.disabled = false;
        } else {
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: result.error,
                confirmButtonColor: '#6366f1'
            });
            button.innerHTML = originalText;
            button.disabled = false;
        }
    } catch (e) {
        Swal.fire({
            icon: 'error',
            title: 'เชื่อมต่อไม่สำเร็จ',
            text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้',
            confirmButtonColor: '#6366f1'
        });
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// --- Logout ---
async function logout() {
    const result = await Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        text: "คุณต้องการออกจากระบบ Dashboard ใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
        try {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
        } catch (e) {
            console.error('Logout error', e);
        }
    }
}

// --- Helpers ---
function showToast(message, type = 'success') {
    // ใช้ SweetAlert Toast แทน Toast แบบเก่า
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: type === 'success' ? 'success' : 'error',
        title: message,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
    });
}

// --- Logs Methods ---
async function fetchLogsList() {
    try {
        const res = await fetch('/api/logs');
        const files = await res.json();
        const select = document.getElementById('log-file-select');
        
        if (files.length === 0) {
            select.innerHTML = '<option value="">No logs found</option>';
            return;
        }
        
        let options = '<option value="">-- Select a log file --</option>';
        files.forEach(f => {
            options += `<option value="${f}">${f}</option>`;
        });
        select.innerHTML = options;
    } catch (e) {
        console.error('Error fetching logs list:', e);
    }
}

async function fetchLogContent() {
    const filename = document.getElementById('log-file-select').value;
    const viewer = document.getElementById('log-viewer');
    
    if (!filename) {
        viewer.textContent = 'Select a log file to view its contents.';
        return;
    }
    
    viewer.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div>';
    
    try {
        const res = await fetch(`/api/logs/${filename}`);
        if (!res.ok) throw new Error('Failed to load');
        const content = await res.text();
        viewer.textContent = content || '(Empty file)';
        // Scroll to bottom
        viewer.scrollTop = viewer.scrollHeight;
    } catch (e) {
        viewer.textContent = 'Error loading log file content.';
        console.error(e);
    }
}

// --- Levels Methods ---
async function fetchLevels() {
    try {
        const res = await fetch('/api/levels');
        const levels = await res.json();
        const tbody = document.getElementById('levels-tbody');
        
        if (levels.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No level data found.</td></tr>';
            return;
        }
        
        let html = '';
        levels.forEach((user, index) => {
            let rankClass = 'rank-other';
            let rankText = index + 1;
            if (index === 0) { rankClass = 'rank-1'; rankText = '1'; }
            else if (index === 1) { rankClass = 'rank-2'; rankText = '2'; }
            else if (index === 2) { rankClass = 'rank-3'; rankText = '3'; }
            
            html += `
                <tr>
                    <td><span class="rank-badge ${rankClass}">${rankText}</span></td>
                    <td>
                        <strong style="color: #f8fafc;">${user.username || 'Unknown User'}</strong><br>
                        <small style="color: #64748b; font-family: monospace;">${user.userId}</small>
                    </td>
                    <td><strong style="color: var(--primary);">Lvl ${user.level}</strong></td>
                    <td>${user.xp.toLocaleString()} XP</td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
    } catch (e) {
        console.error('Error fetching levels:', e);
        document.getElementById('levels-tbody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ef4444;">Error loading data.</td></tr>';
    }
}

// --- News Methods ---
async function sendNews() {
    const type = document.getElementById('news-type').value;
    const title = document.getElementById('news-title').value.trim();
    const content = document.getElementById('news-content').value.trim();
    const btn = document.getElementById('send-news-btn');

    if (!title || !content) {
        Swal.fire({
            icon: 'warning',
            title: 'ข้อมูลไม่ครบถ้วน',
            text: 'กรุณากรอกหัวข้อและรายละเอียดข่าวสารให้ครบก่อนส่ง'
        });
        return;
    }

    const confirmResult = await Swal.fire({
        title: 'ยืนยันการส่งประกาศ?',
        text: "ข้อความนี้จะถูกส่งไปยังห้องดิสคอร์ดที่คุณตั้งค่าไว้ทันที",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ส่งเลย!',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirmResult.isConfirmed) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0; border-width: 2px;"></div> กำลังส่ง...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/news', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, title, content })
        });
        
        const result = await response.json();
        
        if (result.success) {
            Swal.fire({
                icon: 'success',
                title: 'ส่งประกาศสำเร็จ!',
                text: 'ประกาศของคุณถูกส่งเข้าดิสคอร์ดเรียบร้อยแล้ว'
            });
            document.getElementById('news-title').value = '';
            document.getElementById('news-content').value = '';
        } else {
            Swal.fire({
                icon: 'error',
                title: 'ส่งประกาศไม่สำเร็จ',
                text: result.error
            });
        }
    } catch (e) {
        Swal.fire({
            icon: 'error',
            title: 'เชื่อมต่อไม่สำเร็จ',
            text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้'
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// --- Room Access Methods ---
function toggleDurationInput() {
    const action = document.getElementById('access-action').value;
    const durationGroup = document.getElementById('duration-group');
    if (action === 'grant_temp') {
        durationGroup.classList.remove('hidden');
    } else {
        durationGroup.classList.add('hidden');
    }
}

async function grantAccess() {
    const userId = document.getElementById('access-user-id').value.trim();
    const roomId = document.getElementById('access-room-id').value;
    let action = document.getElementById('access-action').value;
    const btn = document.getElementById('grant-access-btn');

    if (!userId) {
        Swal.fire({
            icon: 'warning',
            title: 'ข้อมูลไม่ครบถ้วน',
            text: 'กรุณากรอก User ID ของผู้ใช้'
        });
        return;
    }

    let duration = null;
    if (action === 'grant_temp') {
        const h = parseInt(document.getElementById('access-hours').value) || 0;
        const m = parseInt(document.getElementById('access-minutes').value) || 0;
        const s = parseInt(document.getElementById('access-seconds').value) || 0;
        
        if (h === 0 && m === 0 && s === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบถ้วน',
                text: 'กรุณาระบุระยะเวลาที่มากกว่า 0'
            });
            return;
        }
        
        // Convert to minutes for backend (allows decimals for seconds)
        duration = (h * 60) + m + (s / 60);
        action = 'grant'; // ส่งให้ backend ทราบว่าเป็นการ grant แต่มีเวลา
    }

    const actionText = action === 'grant' ? 'ให้สิทธิ์' : 'ถอนสิทธิ์';
    const confirmResult = await Swal.fire({
        title: `ยืนยันการ${actionText}?`,
        text: `คุณต้องการ${actionText}ผู้ใช้นี้เข้าห้องใช่หรือไม่?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: action === 'revoke' ? '#ef4444' : '#6366f1',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirmResult.isConfirmed) return;

    const originalText = btn.innerHTML;
    btn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; margin: 0; border-width: 2px;"></div> กำลังดำเนินการ...';
    btn.disabled = true;

    try {
        const response = await fetch('/api/grant-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, roomId, action, duration })
        });
        
        const result = await response.json();
        
        if (result.success) {
            let msg = result.message;
            if (result.errors && result.errors.length > 0) {
                msg += '\n\n⚠️ พบปัญหาบางส่วน:\n' + result.errors.join('\n');
            }
            Swal.fire({
                icon: result.errors && result.errors.length > 0 ? 'warning' : 'success',
                title: 'ดำเนินการเสร็จสิ้น',
                text: msg
            });
            fetchRoomAccessList();
            if (action === 'revoke' || action === 'grant') {
                 // reset form but keep id
            }
        } else {
            Swal.fire({
                icon: 'error',
                title: 'ดำเนินการไม่สำเร็จ',
                text: result.error
            });
        }
    } catch (e) {
        Swal.fire({
            icon: 'error',
            title: 'เชื่อมต่อไม่สำเร็จ',
            text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้'
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Global variable for access list
let roomAccessData = [];
let countdownInterval = null;

async function fetchRoomAccessList() {
    try {
        const res = await fetch('/api/room-access-list');
        roomAccessData = await res.json();
        renderRoomAccessList();
        
        // Start countdown interval if there are temporary accesses
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = setInterval(renderRoomAccessList, 1000); // Update every second
    } catch (e) {
        console.error('Error fetching room access list:', e);
        document.getElementById('access-list-tbody').innerHTML = '<tr><td colspan="5" style="text-align: center; color: #ef4444;">Error loading data.</td></tr>';
    }
}

function renderRoomAccessList() {
    const tbody = document.getElementById('access-list-tbody');
    if (!roomAccessData || roomAccessData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">ไม่มีผู้ได้รับสิทธิ์</td></tr>';
        return;
    }

    const now = Date.now();
    let html = '';

    roomAccessData.forEach(item => {
        let typeBadge = item.type === 'temporary' 
            ? '<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">จำกัดเวลา</span>'
            : '<span style="background: rgba(16, 185, 129, 0.2); color: #34d399; padding: 2px 8px; border-radius: 12px; font-size: 0.75rem;">ถาวร</span>';

        let timeLeftStr = '-';
        if (item.type === 'temporary' && item.expireAt) {
            const diff = item.expireAt - now;
            if (diff <= 0) {
                timeLeftStr = '<span style="color: #ef4444;">หมดเวลาแล้ว</span>';
            } else {
                const totalSeconds = Math.floor(diff / 1000);
                const h = Math.floor(totalSeconds / 3600);
                const m = Math.floor((totalSeconds % 3600) / 60);
                const s = totalSeconds % 60;
                timeLeftStr = `<span style="font-family: monospace;">${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}</span>`;
            }
        }

        html += `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        ${item.avatar ? `<img src="${item.avatar}" style="width: 24px; height: 24px; border-radius: 50%;">` : '<div style="width: 24px; height: 24px; border-radius: 50%; background: #475569;"></div>'}
                        <div>
                            <strong style="color: #f8fafc;">${item.username}</strong><br>
                            <small style="color: #64748b; font-family: monospace;">${item.userId}</small>
                        </div>
                    </div>
                </td>
                <td style="font-size: 0.875rem;">${item.roomName}</td>
                <td>${typeBadge}</td>
                <td>${timeLeftStr}</td>
                <td>
                    <button onclick="revokeAccessDirectly('${item.userId}', '${item.roomId}')" style="background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #ef4444; padding: 0.3rem 0.6rem; font-size: 0.75rem; width: auto;">
                        ถอนสิทธิ์
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
}

async function revokeAccessDirectly(userId, roomId) {
    const confirmResult = await Swal.fire({
        title: 'ยืนยันการถอนสิทธิ์?',
        text: "คุณต้องการถอนสิทธิ์ผู้ใช้นี้ทันทีใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ถอนสิทธิ์',
        cancelButtonText: 'ยกเลิก'
    });

    if (!confirmResult.isConfirmed) return;

    try {
        const response = await fetch('/api/grant-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, roomId, action: 'revoke' })
        });
        
        const result = await response.json();
        if (result.success) {
            Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'ถอนสิทธิ์สำเร็จ', showConfirmButton: false, timer: 3000 });
            fetchRoomAccessList();
        } else {
            Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: result.error });
        }
    } catch (e) {
        Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้' });
    }
}


