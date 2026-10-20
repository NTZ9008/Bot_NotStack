// ==========================================
// 🚀 SPLASH — หน้าจอระหว่างเปิดเว็บครั้งแรก / ตรวจ session กับ backend
// หน้าตาเดียวกับ splash ใน index.html (ใช้ class .app-splash ที่ประกาศไว้ใน index.html)
// จึงต่อกันได้เนียนตั้งแต่ก่อน JavaScript โหลดจนถึงตอนหน้าแรกพร้อม
// ==========================================
export function SplashScreen({ label = 'กำลังเชื่อมต่อ...' }: { label?: string }) {
    return (
        <div className="app-splash" role="status" aria-live="polite" aria-label={label}>
            <svg className="app-splash__logo" viewBox="0 0 32 32" aria-hidden>
                <rect width="32" height="32" rx="8" fill="#6366f1" />
                <rect x="8" y="11" width="16" height="12" rx="4" fill="#fff" />
                <circle cx="13" cy="17" r="1.8" fill="#6366f1" />
                <circle cx="19" cy="17" r="1.8" fill="#6366f1" />
                <rect x="15" y="6" width="2" height="5" rx="1" fill="#fff" />
            </svg>
            <p className="app-splash__name">NotStack Dashboard</p>
            <div className="app-splash__bar">
                <span />
            </div>
            <p className="app-splash__label">{label}</p>
        </div>
    );
}
