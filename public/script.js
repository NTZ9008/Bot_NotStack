document.addEventListener('DOMContentLoaded', () => {
    fetchConfig();
    fetchLogsList();
    fetchLevels();
});

// --- Tab Navigation ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.add('hidden'));
    
    event.currentTarget.classList.add('active');
    document.getElementById(tabId).classList.remove('hidden');
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
                    <td style="font-family: monospace;">${user.userId}</td>
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
