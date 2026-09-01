// ==========================================
// 📚 LOG EVENT CATALOG
// รายการ log ทั้งหมดที่ระบบรองรับ — ใช้เป็นแหล่งความจริงเดียว (single source of truth)
// ทั้งฝั่ง DB (seed ค่า default), ฝั่ง API และฝั่ง Dashboard
// ==========================================

// สีมาตรฐานตามชนิดเหตุการณ์ (อิงโทนสีของ Discord)
const COLOR = {
    CREATE: '#57F287',   // เขียว — สร้างของใหม่
    DELETE: '#ED4245',   // แดง — ลบ
    UPDATE: '#FEE75C',   // เหลือง — แก้ไข
    MEMBER: '#5865F2',   // น้ำเงิน — สมาชิก
    VOICE: '#00B0F4',    // ฟ้า — ห้องเสียง
    DANGER: '#992D22',   // แดงเข้ม — แบน / ลงโทษ
    SAFE: '#1ABC9C',     // เขียวน้ำทะเล — ปลดโทษ
};

// group ใช้จัดกลุ่มการ์ดในหน้า Dashboard
const GROUP = {
    MEMBER: 'สมาชิก',
    MESSAGE: 'ข้อความ',
    CHANNEL: 'ช่อง & เธรด',
    SERVER: 'บทบาท & เซิร์ฟเวอร์',
    VOICE: 'ห้องเสียง',
};

const LOG_EVENTS = [
    // --- สมาชิก ---
    { key: 'memberJoin', label: 'สมาชิกเข้า', group: GROUP.MEMBER, color: COLOR.CREATE },
    { key: 'memberLeave', label: 'สมาชิกออก', group: GROUP.MEMBER, color: COLOR.DELETE },
    { key: 'memberBan', label: 'แบนสมาชิก', group: GROUP.MEMBER, color: COLOR.DANGER },
    { key: 'memberUnban', label: 'ปลดแบนสมาชิก', group: GROUP.MEMBER, color: COLOR.SAFE },
    { key: 'memberKick', label: 'เตะสมาชิกแล้ว', group: GROUP.MEMBER, color: COLOR.DANGER },
    { key: 'memberTimeout', label: 'หมดเวลา (ให้ / ลบ)', group: GROUP.MEMBER, color: COLOR.DANGER },
    { key: 'nicknameUpdate', label: 'เปลี่ยนชื่อเล่นแล้ว', group: GROUP.MEMBER, color: COLOR.UPDATE },
    { key: 'roleGiven', label: 'ให้บทบาท', group: GROUP.MEMBER, color: COLOR.CREATE },
    { key: 'roleRemoved', label: 'ลบบทบาท', group: GROUP.MEMBER, color: COLOR.DELETE },

    // --- ข้อความ ---
    { key: 'messageDelete', label: 'ข้อความที่ลบไปแล้ว', group: GROUP.MESSAGE, color: COLOR.DELETE },
    { key: 'messageUpdate', label: 'ข้อความที่แก้ไขแล้ว', group: GROUP.MESSAGE, color: COLOR.UPDATE },
    { key: 'filterUsed', label: 'ใช้คำสั่งการคัดกรอง', group: GROUP.MESSAGE, color: COLOR.DANGER },

    // --- ช่อง & เธรด ---
    { key: 'channelCreate', label: 'สร้างช่องแล้ว', group: GROUP.CHANNEL, color: COLOR.CREATE },
    { key: 'channelDelete', label: 'ลบช่องแล้ว', group: GROUP.CHANNEL, color: COLOR.DELETE },
    { key: 'channelUpdate', label: 'อัพเดตช่องแล้ว', group: GROUP.CHANNEL, color: COLOR.UPDATE },
    { key: 'channelPermissionUpdate', label: 'สิทธิของช่องอัพเดทแล้ว', group: GROUP.CHANNEL, color: COLOR.UPDATE },
    { key: 'threadCreate', label: 'สร้างเธรด', group: GROUP.CHANNEL, color: COLOR.CREATE },
    { key: 'threadDelete', label: 'ลบเธรด', group: GROUP.CHANNEL, color: COLOR.DELETE },
    { key: 'threadUpdate', label: 'อัพเดตเธรดแล้ว', group: GROUP.CHANNEL, color: COLOR.UPDATE },

    // --- บทบาท & เซิร์ฟเวอร์ ---
    { key: 'roleCreate', label: 'สร้างบทบาทแล้ว', group: GROUP.SERVER, color: COLOR.CREATE },
    { key: 'roleDelete', label: 'ลบบทบาทแล้ว', group: GROUP.SERVER, color: COLOR.DELETE },
    { key: 'roleUpdate', label: 'อัพเดทบทบาทแล้ว', group: GROUP.SERVER, color: COLOR.UPDATE },
    { key: 'guildUpdate', label: 'อัปเดตเซิร์ฟเวอร์', group: GROUP.SERVER, color: COLOR.UPDATE },
    { key: 'inviteCreate', label: 'คำเชิญของเซิร์ฟเวอร์', group: GROUP.SERVER, color: COLOR.MEMBER },

    // --- ห้องเสียง ---
    { key: 'voiceJoin', label: 'สมาชิกเข้าร่วมช่องเสียง', group: GROUP.VOICE, color: COLOR.VOICE },
    { key: 'voiceLeave', label: 'สมาชิกออกจากช่องเสียง', group: GROUP.VOICE, color: COLOR.VOICE },
    { key: 'voiceSwitch', label: 'สมาชิกสลับห้องเสียง', group: GROUP.VOICE, color: COLOR.VOICE },
    { key: 'voiceStateChange', label: 'สถานะเสียง (ปิดเสียง/ไม่ได้ยิน)', group: GROUP.VOICE, color: COLOR.VOICE },
    { key: 'voiceMoved', label: 'สมาชิกถูกย้ายไปช่องเสียงอื่น (โดยแอดมิน)', group: GROUP.VOICE, color: COLOR.DANGER },
    { key: 'voiceDisconnected', label: 'สมาชิกถูกตัดออกจากช่องเสียง (โดยแอดมิน)', group: GROUP.VOICE, color: COLOR.DANGER },
];

const LOG_EVENT_KEYS = LOG_EVENTS.map(e => e.key);
const LOG_EVENT_MAP = new Map(LOG_EVENTS.map(e => [e.key, e]));

// ลำดับกลุ่มที่จะแสดงในหน้า Dashboard
const GROUP_ORDER = [GROUP.MEMBER, GROUP.MESSAGE, GROUP.CHANNEL, GROUP.SERVER, GROUP.VOICE];

module.exports = { LOG_EVENTS, LOG_EVENT_KEYS, LOG_EVENT_MAP, GROUP, GROUP_ORDER, COLOR };
