// ==========================================
// 👤 USER PICKER — พิมพ์ชื่อ/username แล้วเลือกคนจาก dropdown
// ใช้แทนการให้แอดมินไปก๊อป User ID มาวางเอง (ยังพิมพ์ ID ตรงๆ ได้ถ้ารู้)
//
// วิธีใช้:
//   <div class="user-picker" data-user-picker="access-user"></div>
//   UserPicker.get('access-user').value        → userId ที่เลือกไว้ (null ถ้ายังไม่เลือก)
//   UserPicker.get('access-user').clear()
//   UserPicker.create(el, { onSelect, exclude })  → สร้างเองในส่วนที่ render ด้วย JS
// ==========================================
(function () {
    const SEARCH_DEBOUNCE = 280;
    const SNOWFLAKE = /^\d{5,25}$/;
    const registry = new Map();
    let seq = 0;

    const fallbackAvatar = (userId) =>
        `https://cdn.discordapp.com/embed/avatars/${SNOWFLAKE.test(userId) ? Number(BigInt(userId) % 5n) : 0}.png`;

    /**
     * @param {HTMLElement} root กล่องที่จะกลายเป็นตัวเลือกผู้ใช้
     * @param {{placeholder?: string, onSelect?: Function, exclude?: () => string[], keepSelection?: boolean}} options
     *   onSelect: เรียกเมื่อเลือกคน — คืน false เพื่อไม่ให้ค้างชื่อไว้ในช่อง
     *   exclude: รายชื่อ userId ที่ไม่ต้องแสดงในผลค้นหา (เช่นคนที่อยู่ใน list แล้ว)
     *   keepSelection: false = ใช้แบบ "เลือกแล้วจบ" (ล้างช่องทันที เช่นปุ่มเพิ่มคนเข้า whitelist)
     */
    function create(root, options = {}) {
        const id = root.dataset.userPicker || `picker-${++seq}`;
        const keepSelection = options.keepSelection !== false;

        root.classList.add('user-picker');
        root.innerHTML = `
            <div class="user-picker-field">
                <svg class="user-picker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                <input type="text" class="input user-picker-input" autocomplete="off" spellcheck="false"
                       placeholder="${escapeHtml(options.placeholder || 'พิมพ์ชื่อหรือ username เพื่อค้นหา...')}">
                <button type="button" class="user-picker-clear hidden" aria-label="ล้างที่เลือกไว้">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            </div>
            <div class="user-picker-dropdown hidden"></div>
            <div class="user-picker-selected hidden"></div>`;

        const input = root.querySelector('.user-picker-input');
        const dropdown = root.querySelector('.user-picker-dropdown');
        const selectedBox = root.querySelector('.user-picker-selected');
        const clearBtn = root.querySelector('.user-picker-clear');

        const state = { id, value: null, user: null, timer: null, results: [], active: -1 };

        function closeDropdown() {
            dropdown.classList.add('hidden');
            state.active = -1;
        }

        function renderSelected() {
            const has = Boolean(state.user);
            selectedBox.classList.toggle('hidden', !has || !keepSelection);
            clearBtn.classList.toggle('hidden', !has);
            if (!has) return;
            selectedBox.innerHTML = `
                <img src="${escapeHtml(state.user.avatar || fallbackAvatar(state.user.userId))}" alt="">
                <div>
                    <strong>${escapeHtml(state.user.username)}</strong>
                    <small class="mono">${escapeHtml(state.user.userId)}</small>
                </div>`;
        }

        function select(user) {
            state.value = user.userId;
            state.user = user;
            closeDropdown();
            if (keepSelection) {
                input.value = user.username;
                renderSelected();
            } else {
                input.value = '';
                clearBtn.classList.add('hidden');
            }
            if (options.onSelect) options.onSelect(user, api);
        }

        function clear() {
            state.value = null;
            state.user = null;
            input.value = '';
            selectedBox.classList.add('hidden');
            clearBtn.classList.add('hidden');
            closeDropdown();
        }

        function renderResults(members, query) {
            const excluded = options.exclude ? options.exclude() : [];
            state.results = members.filter((m) => !excluded.includes(m.userId));

            // ถ้าพิมพ์เป็นตัวเลขล้วน ให้เลือกใช้เป็น User ID ตรงๆ ได้เลย (เผื่อคนไม่ได้อยู่ในเซิร์ฟเวอร์แล้ว)
            if (SNOWFLAKE.test(query) && !state.results.some((m) => m.userId === query)) {
                state.results.unshift({ userId: query, username: `ใช้ User ID: ${query}`, tag: query, avatar: fallbackAvatar(query), raw: true });
            }

            if (state.results.length === 0) {
                dropdown.innerHTML = '<div class="user-picker-empty">ไม่พบสมาชิกที่ตรงกับคำค้นนี้</div>';
                dropdown.classList.remove('hidden');
                return;
            }

            state.active = 0;
            dropdown.innerHTML = state.results.map((m, i) => `
                <button type="button" class="user-picker-item ${i === 0 ? 'active' : ''}" data-index="${i}">
                    <img src="${escapeHtml(m.avatar || fallbackAvatar(m.userId))}" alt="">
                    <span class="user-picker-item-text">
                        <strong>${escapeHtml(m.username)}${m.nickname ? ` (${escapeHtml(m.nickname)})` : ''}</strong>
                        <small>${m.raw ? 'ไม่ได้อยู่ในรายชื่อสมาชิก' : `@${escapeHtml(m.tag)}`}</small>
                    </span>
                </button>`).join('');
            dropdown.classList.remove('hidden');
        }

        async function search() {
            const query = input.value.trim();
            if (!query) return closeDropdown();

            dropdown.innerHTML = '<div class="user-picker-empty">กำลังค้นหา...</div>';
            dropdown.classList.remove('hidden');
            try {
                const res = await fetch(`/api/search-members?q=${encodeURIComponent(query)}`);
                const members = res.ok ? await res.json() : [];
                // ผู้ใช้อาจพิมพ์ต่อระหว่างรอผล — ทิ้งผลที่ล้าสมัยไป
                if (input.value.trim() !== query) return;
                renderResults(Array.isArray(members) ? members : [], query);
            } catch (err) {
                dropdown.innerHTML = '<div class="user-picker-empty">ค้นหาไม่สำเร็จ กรุณาลองใหม่</div>';
            }
        }

        function moveActive(step) {
            const items = [...dropdown.querySelectorAll('.user-picker-item')];
            if (items.length === 0) return;
            state.active = (state.active + step + items.length) % items.length;
            items.forEach((item, i) => item.classList.toggle('active', i === state.active));
            items[state.active].scrollIntoView({ block: 'nearest' });
        }

        input.addEventListener('input', () => {
            clearTimeout(state.timer);
            // แก้ข้อความ = ยังไม่ได้เลือกใครใหม่
            state.value = null;
            state.user = null;
            selectedBox.classList.add('hidden');
            clearBtn.classList.toggle('hidden', !input.value);
            state.timer = setTimeout(search, SEARCH_DEBOUNCE);
        });

        input.addEventListener('focus', () => { if (input.value.trim()) search(); });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); moveActive(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); moveActive(-1); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (state.results[state.active]) select(state.results[state.active]);
            } else if (e.key === 'Escape') closeDropdown();
        });

        dropdown.addEventListener('mousedown', (e) => {
            const item = e.target.closest('.user-picker-item');
            if (!item) return;
            e.preventDefault(); // กัน blur ทำงานก่อน
            select(state.results[Number(item.dataset.index)]);
        });

        clearBtn.addEventListener('click', clear);
        input.addEventListener('blur', () => setTimeout(closeDropdown, 150));

        const api = {
            id,
            root,
            get value() { return state.value; },
            get user() { return state.user; },
            clear,
            focus: () => input.focus(),
            // ข้อความดิบในช่อง — ใช้ตอนผู้ใช้พิมพ์ ID เองแล้วไม่ได้กดเลือกจาก dropdown
            get raw() { return input.value.trim(); },
        };

        registry.set(id, api);
        return api;
    }

    // สร้างให้อัตโนมัติสำหรับกล่องที่ประกาศไว้ใน HTML
    // (ข้าม data-picker-manual — ที่นั่นสคริปต์ของหน้านั้นสร้างเองพร้อม onSelect ของตัวเอง)
    function initAll() {
        document.querySelectorAll('[data-user-picker]:not([data-picker-manual])').forEach((el) => {
            if (registry.has(el.dataset.userPicker)) return;
            create(el, { placeholder: el.dataset.placeholder });
        });
    }

    window.UserPicker = {
        create,
        initAll,
        get: (id) => registry.get(id),
        // เอาไว้ตอน render ใหม่แล้ว element เดิมหายไป
        forget: (id) => registry.delete(id),
    };

    document.addEventListener('DOMContentLoaded', initAll);
})();
