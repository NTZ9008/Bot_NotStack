// ==========================================
// 📊 OVERVIEW TAB (ADMIN)
// กราฟความเคลื่อนไหวของเซิร์ฟเวอร์ — ข้อมูลมาจาก /api/admin/activity/stats
// (ตาราง activity_events ที่ Log Manager บันทึกไว้ทุกเหตุการณ์)
// ==========================================

const OV_COLORS = {
    join: '#10b981',
    leave: '#ef4444',
    voiceJoin: '#38bdf8',
    voiceLeave: '#f59e0b',
    users: '#6366f1',
    grid: 'rgba(255, 255, 255, 0.08)',
    text: '#94a3b8',
};

// สีของกราฟโดนัท — วนใช้ซ้ำเมื่อชนิดเหตุการณ์มีมากกว่าจำนวนสี
const OV_PALETTE = ['#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#a78bfa', '#14b8a6', '#fb923c', '#64748b'];

const ovCharts = {};
let ovRangeHours = 168;   // ค่าเริ่มต้น 7 วันล่าสุด
let ovLoading = false;

// ==========================================
// ตัวช่วยแสดงผล
// ==========================================
function ovFormatMinutes(minutes) {
    if (!minutes) return '0 นาที';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours === 0) return `${mins} นาที`;
    return mins === 0 ? `${hours} ชม.` : `${hours} ชม. ${mins} นาที`;
}

const ovNumber = (value) => Number(value || 0).toLocaleString('th-TH');

// label จาก API เป็น 'YYYY-MM-DD HH:00' (เวลาไทย) — ย่อให้อ่านง่ายบนแกน X
function ovShortLabel(bucket, interval) {
    const [date, time] = String(bucket).split(' ');
    const [, month, day] = date.split('-');
    return interval === 'hour' ? `${day}/${month} ${time?.slice(0, 2)}:00` : `${day}/${month}`;
}

// ==========================================
// ช่วงเวลาที่เลือก
// ==========================================
function ovRangeParams() {
    const params = new URLSearchParams();
    if (ovRangeHours === 'custom') {
        const from = document.getElementById('ov-from').value;
        const to = document.getElementById('ov-to').value;
        if (from) params.set('from', new Date(from).toISOString());
        if (to) params.set('to', new Date(to).toISOString());
    } else {
        params.set('from', new Date(Date.now() - ovRangeHours * 3600000).toISOString());
    }
    const interval = document.getElementById('ov-interval').value;
    if (interval !== 'auto') params.set('interval', interval);
    if (document.getElementById('ov-include-bots').checked) params.set('includeBots', 'true');
    return params;
}

function ovSelectPreset(button) {
    document.querySelectorAll('.ov-preset').forEach((btn) => btn.classList.toggle('active', btn === button));
    const value = button.dataset.hours;
    ovRangeHours = value === 'custom' ? 'custom' : Number(value);

    const custom = document.getElementById('ov-custom-range');
    custom.classList.toggle('hidden', ovRangeHours !== 'custom');
    if (ovRangeHours === 'custom') {
        // เติมค่าเริ่มต้นเป็น 7 วันล่าสุด ให้ผู้ใช้แก้ต่อได้ทันที
        const toInput = document.getElementById('ov-to');
        const fromInput = document.getElementById('ov-from');
        const local = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        if (!toInput.value) toInput.value = local(new Date());
        if (!fromInput.value) fromInput.value = local(new Date(Date.now() - 7 * 86400000));
        return; // รอให้ผู้ใช้กด "ดูข้อมูล" เอง
    }
    loadOverview();
}

// ==========================================
// โหลดข้อมูล + วาดทุกส่วน
// ==========================================
async function loadOverview() {
    if (!isAdmin() || ovLoading) return;
    ovLoading = true;
    const meta = document.getElementById('ov-meta');
    meta.textContent = 'กำลังโหลดข้อมูล...';

    try {
        const data = await adminRequest('GET', `/api/admin/activity/stats?${ovRangeParams()}`);
        renderOverviewMeta(data);
        renderOverviewStats(data.summary);
        renderOverviewCharts(data);
        renderOverviewTables(data);
    } catch (err) {
        meta.innerHTML = `<span class="cell-error">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(err.message)}</span>`;
    } finally {
        ovLoading = false;
    }
}

function renderOverviewMeta(data) {
    const meta = document.getElementById('ov-meta');
    const from = new Date(data.range.from);
    const to = new Date(data.range.to);
    const resolution = data.range.interval === 'hour' ? 'รายชั่วโมง' : 'รายวัน';
    const empty = data.summary.totalEvents === 0
        ? ' — ยังไม่มีข้อมูลในช่วงนี้ (ระบบเริ่มเก็บสถิติตั้งแต่เปิดใช้งานเวอร์ชันนี้เป็นต้นไป)'
        : '';
    meta.textContent = `${formatDateTime(from)} — ${formatDateTime(to)} · ${resolution}${empty}`;
}

function renderOverviewStats(summary) {
    const tiles = [
        { label: 'เหตุการณ์ทั้งหมด', value: ovNumber(summary.totalEvents) },
        { label: 'เข้าเซิร์ฟเวอร์', value: ovNumber(summary.serverJoin), tone: 'ok' },
        { label: 'ออกเซิร์ฟเวอร์', value: ovNumber(summary.serverLeave), tone: 'bad' },
        { label: 'สมาชิกเปลี่ยนแปลงสุทธิ', value: `${summary.serverJoin - summary.serverLeave > 0 ? '+' : ''}${ovNumber(summary.serverJoin - summary.serverLeave)}`, tone: summary.serverJoin >= summary.serverLeave ? 'ok' : 'bad' },
        { label: 'เข้าห้องเสียง', value: ovNumber(summary.voiceJoin), tone: 'info' },
        { label: 'เวลารวมในห้องเสียง', value: ovFormatMinutes(summary.voiceMinutes), tone: 'info' },
        { label: 'ข้อความที่ส่ง', value: ovNumber(summary.messages) },
        { label: 'ผู้ใช้ที่เคลื่อนไหว', value: ovNumber(summary.activeUsers) },
    ];
    document.getElementById('ov-stats').innerHTML = tiles.map((tile) => `
        <div class="stat-tile stat-${tile.tone || 'plain'}">
            <span class="stat-value">${escapeHtml(tile.value)}</span>
            <span class="stat-label">${escapeHtml(tile.label)}</span>
        </div>`).join('');
}

// สร้างกราฟใหม่ทุกครั้งที่โหลดข้อมูล (ทำลายของเดิมก่อน กัน canvas ซ้อนกัน)
function ovRenderChart(id, config) {
    if (ovCharts[id]) ovCharts[id].destroy();
    const canvas = document.getElementById(id);
    if (!canvas) return;
    ovCharts[id] = new Chart(canvas, config);
}

const OV_BASE_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
        legend: { labels: { color: OV_COLORS.text, boxWidth: 12 } },
    },
    scales: {
        x: { ticks: { color: OV_COLORS.text, maxRotation: 0, autoSkipPadding: 16 }, grid: { color: OV_COLORS.grid } },
        y: { beginAtZero: true, ticks: { color: OV_COLORS.text, precision: 0 }, grid: { color: OV_COLORS.grid } },
    },
};

function ovLineDataset(label, data, color) {
    return {
        label,
        data,
        borderColor: color,
        backgroundColor: `${color}33`,
        borderWidth: 2,
        pointRadius: data.length > 40 ? 0 : 3,
        tension: 0.3,
        fill: true,
    };
}

function renderOverviewCharts(data) {
    const labels = data.labels.map((bucket) => ovShortLabel(bucket, data.range.interval));

    ovRenderChart('chart-server', {
        type: 'line',
        data: {
            labels,
            datasets: [
                ovLineDataset('เข้าเซิร์ฟเวอร์', data.datasets.serverJoin, OV_COLORS.join),
                ovLineDataset('ออกเซิร์ฟเวอร์', data.datasets.serverLeave, OV_COLORS.leave),
            ],
        },
        options: OV_BASE_OPTIONS,
    });

    ovRenderChart('chart-voice', {
        type: 'line',
        data: {
            labels,
            datasets: [
                ovLineDataset('เข้าห้องเสียง', data.datasets.voiceJoin, OV_COLORS.voiceJoin),
                ovLineDataset('ออกห้องเสียง', data.datasets.voiceLeave, OV_COLORS.voiceLeave),
            ],
        },
        options: OV_BASE_OPTIONS,
    });

    const topUsers = data.topUsers.slice(0, 10);
    ovRenderChart('chart-users', {
        type: 'bar',
        data: {
            labels: topUsers.map((user) => user.userName),
            datasets: [{
                label: 'จำนวนเหตุการณ์',
                data: topUsers.map((user) => user.total),
                backgroundColor: `${OV_COLORS.users}cc`,
                borderRadius: 6,
            }],
        },
        options: {
            ...OV_BASE_OPTIONS,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, ticks: { color: OV_COLORS.text, precision: 0 }, grid: { color: OV_COLORS.grid } },
                y: { ticks: { color: OV_COLORS.text }, grid: { display: false } },
            },
        },
    });

    const breakdown = data.breakdown.slice(0, 10);
    ovRenderChart('chart-breakdown', {
        type: 'doughnut',
        data: {
            labels: breakdown.map((row) => row.label),
            datasets: [{
                data: breakdown.map((row) => row.total),
                backgroundColor: breakdown.map((_, i) => OV_PALETTE[i % OV_PALETTE.length]),
                borderColor: 'rgba(15, 23, 42, 0.9)',
                borderWidth: 2,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: OV_COLORS.text, boxWidth: 12, font: { size: 11 } } } },
        },
    });
}

const ovEmptyRow = (cols) => `<tr><td colspan="${cols}" class="cell-center" class="muted">ยังไม่มีข้อมูลในช่วงเวลานี้</td></tr>`;

function renderOverviewTables(data) {
    // เวลาในห้องเสียงคิดจากช่วงที่เลือกเท่านั้น จึงเก็บแยกไว้ผูกกับตารางห้อง
    const minutesByChannel = new Map(data.voiceChannelMinutes.map((row) => [row.channelId, row.minutes]));

    document.getElementById('ov-users-tbody').innerHTML = data.topUsers.length
        ? data.topUsers.map((user, i) => `
            <tr>
                <td><span class="rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}">${i + 1}</span></td>
                <td>
                    <strong>${escapeHtml(user.userName)}</strong>${user.isBot ? ' <span class="status-badge status-self">BOT</span>' : ''}<br>
                    <small class="mono">${escapeHtml(user.userId)}</small>
                </td>
                <td><strong>${ovNumber(user.total)}</strong></td>
                <td>${ovNumber(user.messages)}</td>
                <td>${ovNumber(user.voiceJoins)}</td>
                <td>${ovNumber(user.commands)}</td>
                <td><small>${escapeHtml(formatDateTime(user.lastSeen))}</small></td>
            </tr>`).join('')
        : ovEmptyRow(7);

    document.getElementById('ov-voice-users-tbody').innerHTML = data.topVoiceUsers.length
        ? data.topVoiceUsers.map((user, i) => `
            <tr>
                <td><span class="rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}">${i + 1}</span></td>
                <td><strong>${escapeHtml(user.userName)}</strong><br><small class="mono">${escapeHtml(user.userId)}</small></td>
                <td>${escapeHtml(ovFormatMinutes(user.minutes))}</td>
                <td>${ovNumber(user.sessions)}</td>
            </tr>`).join('')
        : ovEmptyRow(4);

    document.getElementById('ov-voice-channels-tbody').innerHTML = data.topVoiceChannels.length
        ? data.topVoiceChannels.map((channel, i) => `
            <tr>
                <td><span class="rank-badge ${i < 3 ? `rank-${i + 1}` : 'rank-other'}">${i + 1}</span></td>
                <td><strong>${escapeHtml(channel.channelName)}</strong><br><small class="mono">${escapeHtml(channel.channelId)}</small></td>
                <td>${ovNumber(channel.joins)}</td>
                <td>${ovNumber(channel.members)}</td>
                <td>${escapeHtml(ovFormatMinutes(minutesByChannel.get(channel.channelId) || 0))}</td>
            </tr>`).join('')
        : ovEmptyRow(5);
}

document.addEventListener('DOMContentLoaded', async () => {
    document.querySelectorAll('.ov-preset').forEach((btn) => {
        btn.addEventListener('click', () => ovSelectPreset(btn));
    });

    await window.authReady;
    if (isAdmin()) loadOverview();
});
