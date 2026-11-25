// 🎄 ช่วงคริสต์มาส + ปีใหม่ (ตามเวลาไทย) — ใช้ร่วมกันทั้งธีมหน้า landing และป้ายแนะนำธีมใน Dashboard
// อยากดูก่อน/หลังช่วงนั้นเปิด ?festival=christmas (?festival=<ชื่ออื่น> = ปิด) · จบเทศกาลแล้วลบไฟล์นี้กับที่ import
const SHOW_FROM = '2026-11-25'; // เริ่มต่อจากลอยกระทงเลย
const SHOW_UNTIL = '2027-01-05';

export function isChristmasSeason() {
    const forced = new URLSearchParams(window.location.search).get('festival');
    if (forced) return forced === 'christmas';
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' }); // YYYY-MM-DD
    return today >= SHOW_FROM && today <= SHOW_UNTIL;
}
