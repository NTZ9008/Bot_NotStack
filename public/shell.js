// ==========================================
// 🧭 SHELL — เมนูซ้าย, ค้นหาหน้า และเมนูโปรไฟล์บนแถบด้านบน
// โหลดเป็นไฟล์สุดท้าย (ต้องการ switchTab จาก script.js และ logout จาก account-dashboard.js)
// ==========================================

const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const searchInput = document.getElementById('page-search');
const searchResults = document.getElementById('search-results');
const profileMenu = document.getElementById('user-chip');
const profileDropdown = document.getElementById('profile-dropdown');

// เมนูซ้ายเป็นลิ้นชักเฉพาะจอเล็ก (ตรงกับ media query ใน style.css)
const isDrawer = () => window.matchMedia('(max-width: 1024px)').matches;

// ==========================================
// เมนูซ้าย
// ==========================================
function openSidebar() {
    sidebar.classList.add('open');
    sidebarOverlay.hidden = false;
    sidebarOverlay.setAttribute('data-open', '');
}

function closeSidebar() {
    sidebar.classList.remove('open');
    sidebarOverlay.hidden = true;
    sidebarOverlay.removeAttribute('data-open');
}

document.getElementById('sidebar-toggle').addEventListener('click', openSidebar);
document.getElementById('sidebar-close').addEventListener('click', closeSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);
window.addEventListener('resize', () => { if (!isDrawer()) closeSidebar(); });

// switchTab (script.js) เรียกตัวนี้ทุกครั้งที่เปลี่ยนหน้า
window.onTabSwitched = function (tabId) {
    const item = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const title = document.getElementById('page-title');
    if (item && title) title.textContent = item.dataset.label;
    if (isDrawer()) closeSidebar();
    closeSearch();
    closeProfile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// ค้นหาหน้า — พิมพ์ชื่อเมนู (ไทย/อังกฤษ) แล้วกด Enter เพื่อกระโดดไปหน้านั้น
// ==========================================
let searchIndex = [];
let searchActive = -1;

// สร้างรายการจากเมนูซ้าย — ข้ามหน้าที่ผู้ใช้คนนี้ไม่มีสิทธิ์เข้า (ถูกซ่อนด้วย data-admin-only)
function buildSearchIndex() {
    searchIndex = [...document.querySelectorAll('.nav-item')]
        .filter((item) => item.offsetParent !== null)
        .map((item) => ({
            tab: item.dataset.tab,
            label: item.dataset.label,
            keywords: (item.dataset.keywords || '').toLowerCase(),
            group: item.closest('.sidebar-nav')
                ? [...item.parentElement.children]
                    .slice(0, [...item.parentElement.children].indexOf(item))
                    .filter((el) => el.classList.contains('nav-group')).pop()?.textContent || ''
                : '',
            icon: item.querySelector('svg')?.innerHTML || '',
        }));
}

function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    const matches = q
        ? searchIndex.filter((page) => page.label.toLowerCase().includes(q) || page.keywords.includes(q))
        : searchIndex;

    searchActive = matches.length ? 0 : -1;
    searchResults.innerHTML = matches.length
        ? matches.map((page, i) => `
            <button type="button" class="search-result ${i === 0 ? 'active' : ''}" data-tab="${escapeHtml(page.tab)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${page.icon}</svg>
                <span>${escapeHtml(page.label)}</span>
                <small>${escapeHtml(page.group)}</small>
            </button>`).join('')
        : '<p class="search-empty">ไม่พบหน้าที่ตรงกับคำค้นนี้</p>';
    searchResults.classList.remove('hidden');
}

function closeSearch() {
    searchResults.classList.add('hidden');
    searchActive = -1;
}

function moveSearchActive(step) {
    const items = [...searchResults.querySelectorAll('.search-result')];
    if (items.length === 0) return;
    searchActive = (searchActive + step + items.length) % items.length;
    items.forEach((item, i) => item.classList.toggle('active', i === searchActive));
    items[searchActive].scrollIntoView({ block: 'nearest' });
}

function gotoSearchResult(index) {
    const items = [...searchResults.querySelectorAll('.search-result')];
    const target = items[index];
    if (!target) return;
    searchInput.value = '';
    searchInput.blur();
    switchTab(target.dataset.tab);
}

searchInput.addEventListener('focus', () => {
    buildSearchIndex();
    renderSearchResults(searchInput.value);
});

searchInput.addEventListener('input', () => renderSearchResults(searchInput.value));

searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        moveSearchActive(1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        moveSearchActive(-1);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        gotoSearchResult(searchActive);
    } else if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.blur();
        closeSearch();
    }
});

searchResults.addEventListener('mousedown', (e) => {
    const button = e.target.closest('.search-result');
    if (!button) return;
    e.preventDefault(); // กัน blur ทำงานก่อน click
    gotoSearchResult([...searchResults.querySelectorAll('.search-result')].indexOf(button));
});

searchInput.addEventListener('blur', () => setTimeout(closeSearch, 120));

// Ctrl/⌘ + K เพื่อกระโดดมาที่ช่องค้นหา
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
    }
});

// ปุ่มลัดบนแป้นพิมพ์ Mac แสดงเป็น ⌘ K
if (navigator.platform?.toLowerCase().includes('mac')) {
    document.getElementById('search-kbd').textContent = '⌘ K';
}

// ==========================================
// เมนูโปรไฟล์
// ==========================================
const profileBtn = document.getElementById('profile-btn');

function closeProfile() {
    profileMenu.classList.remove('open');
    profileDropdown.classList.add('hidden');
    profileBtn.setAttribute('aria-expanded', 'false');
}

profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = profileMenu.classList.toggle('open');
    profileDropdown.classList.toggle('hidden', !open);
    profileBtn.setAttribute('aria-expanded', String(open));
});

document.addEventListener('click', (e) => {
    if (!profileMenu.contains(e.target)) closeProfile();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfile(); });

document.getElementById('logout-btn').addEventListener('click', logout);

// ตั้งชื่อหน้าให้ตรงกับแท็บที่เปิดอยู่ตอนโหลดเสร็จ (role ของผู้ใช้ตัดสินว่าหน้าแรกคือหน้าไหน)
document.addEventListener('DOMContentLoaded', async () => {
    await window.authReady;
    buildSearchIndex();
    const current = document.querySelector('.nav-item.active');
    if (current) window.onTabSwitched(current.dataset.tab);
});
