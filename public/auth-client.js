// ==========================================
// 🔐 AUTH CLIENT — โหลดก่อนสคริปต์อื่นทุกตัวในหน้า Dashboard
// access token (JWT) อายุ 15 นาที อยู่ใน httpOnly cookie — เมื่อ API ตอบ 401 จะเรียก /api/auth/refresh ให้เอง
// แล้วส่ง request เดิมซ้ำ 1 ครั้ง (ครอบ window.fetch ไว้ที่เดียว สคริปต์อื่นไม่ต้องแก้โค้ด fetch)
// ==========================================
(function () {
    const nativeFetch = window.fetch.bind(window);
    const NO_RETRY = ['/api/auth/login', '/api/auth/refresh', '/api/auth/logout'];
    let refreshing = null;
    let redirecting = false;

    // หลาย request เจอ 401 พร้อมกัน → refresh แค่ครั้งเดียว แล้วทุกตัวรอผลเดียวกัน
    function refreshSession() {
        if (!refreshing) {
            refreshing = nativeFetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
                .then(async (res) => {
                    if (res.ok) return true;
                    const data = await res.json().catch(() => ({}));
                    // อีกแท็บเพิ่ง refresh ไป — รอให้เบราว์เซอร์รับ cookie ใบใหม่แล้วใช้ต่อได้เลย
                    if (data.code === 'TOKEN_ROTATED') {
                        await new Promise((resolve) => setTimeout(resolve, 500));
                        return true;
                    }
                    return false;
                })
                .catch(() => false)
                .finally(() => { refreshing = null; });
        }
        return refreshing;
    }

    function isRetryableApi(input) {
        const url = new URL(typeof input === 'string' ? input : input.url, location.origin);
        return url.origin === location.origin && url.pathname.startsWith('/api/') && !NO_RETRY.includes(url.pathname);
    }

    function redirectToLogin() {
        if (redirecting) return;
        redirecting = true;
        location.href = '/login';
    }

    window.fetch = async function (input, init) {
        const response = await nativeFetch(input, init);
        if (response.status !== 401 || !isRetryableApi(input)) return response;

        if (await refreshSession()) {
            const retry = await nativeFetch(input, init);
            if (retry.status !== 401) return retry;
        }
        redirectToLogin();
        return response;
    };

    // ใช้ตอนเอาข้อความจากผู้ใช้/Discord ไปใส่ innerHTML — กันชื่อแปลกๆ อย่าง <img onerror=...> กลายเป็นโค้ด
    window.escapeHtml = function (value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    // ข้อมูลผู้ใช้ที่ login อยู่ — สคริปต์อื่น await ตัวนี้ก่อนตัดสินใจว่าจะโหลดแท็บของ ADMIN หรือไม่
    window.authReady = fetch('/api/auth/me')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
            window.currentUser = data?.user || null;
            window.discordLoginEnabled = Boolean(data?.discordEnabled);
            return window.currentUser;
        })
        .catch(() => null);

    window.isAdmin = () => window.currentUser?.role === 'ADMIN';
})();
