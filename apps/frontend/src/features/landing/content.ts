// ==========================================
// 📄 เนื้อหาหน้า landing — ความสามารถ / คำสั่ง / ทีมผู้พัฒนา (อัปเดตที่นี่ที่เดียวเมื่อเพิ่มฟีเจอร์หรือคำสั่งใหม่)
// ==========================================

export interface Feature {
    title: string;
    description: string;
}

export interface FeatureGroup {
    id: string;
    label: string;
    intro: string;
    features: Feature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
    {
        id: 'security',
        label: 'กันคนป่วน',
        intro: 'ดูแลเซิร์ฟให้ปลอดภัย',
        features: [
            { title: 'Voice Monitor', description: 'แจ้งเตือนเมื่อมีคนแกล้งเปลี่ยน bitrate / region ห้องเสียง' },
            { title: 'Voice Guard', description: 'กำหนดว่าใครเข้าห้องเสียงได้หรือไม่ได้' },
            { title: 'Anti-spam', description: 'ลบข้อความเมื่อส่งรัวเกินไป' },
            { title: 'กรองคำหยาบ', description: 'ลบคำหยาบ คำก้ำกึ่งให้ AI ช่วยดู' },
            { title: 'Room Access', description: 'ให้สิทธิ์เข้าห้องลับ ตั้งเวลาหมดอายุได้' },
        ],
    },
    {
        id: 'community',
        label: 'ทำให้เซิร์ฟคึกคัก',
        intro: 'ให้สมาชิกอยากเข้ามาคุย',
        features: [
            { title: 'เลเวล & การ์ดอันดับ', description: 'คุย / เข้าห้องเสียง แล้วได้ XP เลเวลอัปได้ยศ' },
            { title: 'แชทกับ AI', description: 'แท็กบอทแล้วถามได้เลย' },
            { title: 'การ์ดต้อนรับ', description: 'ต้อนรับคนใหม่ด้วยการ์ดรูปภาพ' },
            { title: 'ประกาศ', description: 'เขียนประกาศ ดูตัวอย่างก่อนส่ง' },
            { title: 'รายงานอากาศ', description: 'ส่งพยากรณ์อากาศให้ทุกเช้า' },
            { title: 'โพล & สุ่ม', description: 'โหวตไม่เปิดชื่อ สุ่มของ รับยศจาก reaction' },
        ],
    },
    {
        id: 'team',
        label: 'ใช้กับทีม',
        intro: 'ทำงานกันใน Discord ได้เลย',
        features: [
            { title: 'แจ้งเตือน GitHub PR', description: 'PR ละข้อความเดียว อัปเดตสถานะให้เอง' },
            { title: 'เปิด Jira card', description: 'เปิด card จาก Discord ไม่ต้องมีบัญชี Jira' },
            { title: 'เก็บเงิน', description: 'บันทึกใครจ่ายแล้ว ส่งสรุปเข้าห้อง' },
        ],
    },
    {
        id: 'logs',
        label: 'ย้อนดูได้',
        intro: 'รู้ว่าเกิดอะไรขึ้นในเซิร์ฟ',
        features: [
            { title: 'Log Manager', description: 'เลือกเหตุการณ์ที่จะเก็บ และห้องที่จะส่ง' },
            { title: 'ภาพรวมเซิร์ฟ', description: 'กราฟคนเข้า-ออก และคนที่แอคทีฟ' },
            { title: 'ประวัติการตั้งค่า', description: 'ใครแก้อะไรใน Dashboard เมื่อไร' },
        ],
    },
];

export type CommandCategory = 'level' | 'tool' | 'info' | 'home';

export const COMMAND_CATEGORIES: { id: CommandCategory; label: string }[] = [
    { id: 'level', label: 'เลเวล' },
    { id: 'tool', label: 'ของใช้' },
    { id: 'info', label: 'ข้อมูล' },
    { id: 'home', label: 'เฉพาะเซิร์ฟหลัก' },
];

export interface CommandOption {
    name: string;
    required?: boolean;
    description: string;
}

export interface Command {
    name: string;
    category: CommandCategory;
    summary: string;
    detail: string;
    options?: CommandOption[];
    example?: string;
    notes?: string[];
    // คำค้นเพิ่ม (ไทย/อังกฤษ) ที่ไม่ได้อยู่ในชื่อหรือคำอธิบาย
    keywords?: string;
}

export const COMMANDS: Command[] = [
    {
        name: 'rank',
        category: 'level',
        summary: 'ดูการ์ดเลเวลของตัวเองหรือเพื่อน',
        detail: 'ส่งการ์ดรูปภาพที่มีรูปโปรไฟล์ อันดับในเซิร์ฟ เลเวล XP และหลอดความคืบหน้าไปเลเวลถัดไป',
        options: [{ name: 'target', description: 'สมาชิกที่อยากดู เว้นว่าง = ของตัวเอง' }],
        example: '/rank target:@เพื่อน',
        keywords: 'level xp การ์ด อันดับ',
    },
    {
        name: 'leaderboard',
        category: 'level',
        summary: 'ตารางอันดับ XP ของเซิร์ฟ',
        detail: 'ส่งรูปตารางอันดับหน้าละ 10 คน มีปุ่ม ◀ ▶ ให้เลื่อนดูหน้าอื่น',
        options: [{ name: 'page', description: 'หน้าที่อยากเปิด (เริ่มที่ 1)' }],
        example: '/leaderboard page:2',
        notes: ['กดเปลี่ยนหน้าได้ทุก 3 วินาทีต่อคน'],
        keywords: 'top ranking อันดับ',
    },
    {
        name: 'rankcard',
        category: 'level',
        summary: 'แต่งการ์ด /rank ของตัวเอง',
        detail: 'เปิดเมนูให้เลือกแบบการ์ด สีหลัก และพื้นหลัง เห็นตัวอย่างก่อนบันทึก เมนูนี้เห็นแค่คุณคนเดียว',
        notes: ['สีต้องเป็นรหัสแบบ #RRGGBB เช่น #818CF8', 'ถ้าแอดมินปิดการแต่งการ์ดเอง ทุกคนจะใช้ธีมของเซิร์ฟ'],
        keywords: 'theme สี พื้นหลัง customize',
    },
    {
        name: 'xp history',
        category: 'level',
        summary: 'ดูว่า XP ได้มา/หายไปจากอะไร',
        detail: 'แสดง XP 10 รายการล่าสุด พร้อม XP ที่ได้วันนี้เทียบกับเพดานต่อวัน เห็นแค่คุณคนเดียว',
        options: [{ name: 'member', description: 'ดูของคนอื่น (ต้องมีสิทธิ์ Manage Server)' }],
        example: '/xp history',
        notes: ['เก็บประวัติย้อนหลัง 90 วัน'],
        keywords: 'ประวัติ log',
    },
    {
        name: 'weather',
        category: 'tool',
        summary: 'รายงานอากาศ กราฟพยากรณ์ และเรดาร์ฝน',
        detail: 'บอกอุณหภูมิ โอกาสฝน ความชื้น ลม และ PM2.5 พร้อมกราฟพยากรณ์และแผนที่เรดาร์ฝนแบบเคลื่อนไหว',
        options: [{ name: 'city', description: 'ชื่อเมือง สถานที่ หรือพิกัด เว้นว่าง = ใช้สถานที่เดียวกับรายงานประจำวันของเซิร์ฟ' }],
        example: '/weather city:เชียงใหม่',
        notes: ['ใช้ได้คนละครั้งทุก 30 วินาที'],
        keywords: 'อากาศ ฝน pm2.5 ฝุ่น forecast rain',
    },
    {
        name: 'poll',
        category: 'tool',
        summary: 'โพลแบบไม่เปิดเผยชื่อคนโหวต',
        detail: 'สร้างโพลพร้อมปุ่มให้กด หนึ่งคนหนึ่งเสียง กดใหม่ = เปลี่ยนคำตอบ ไม่มีใครเห็นว่าใครโหวตอะไร',
        options: [
            { name: 'question', required: true, description: 'คำถาม (ไม่เกิน 200 ตัวอักษร)' },
            { name: 'choices', required: true, description: 'ตัวเลือก 2–5 ข้อ คั่นด้วยจุลภาค' },
        ],
        example: '/poll question:เย็นนี้กินอะไร choices:กะเพรา,ส้มตำ,ชาบู',
        keywords: 'vote โหวต',
    },
    {
        name: 'random',
        category: 'tool',
        summary: 'สุ่มเลือกหนึ่งอย่างจากรายการ',
        detail: 'พิมพ์ตัวเลือกคั่นด้วยจุลภาค บอทจะสุ่มมาให้หนึ่งอย่าง เหมาะกับเวลาตกลงกันไม่ได้',
        options: [{ name: 'items', required: true, description: 'ตัวเลือกอย่างน้อย 2 อย่าง คั่นด้วยจุลภาค' }],
        example: '/random items:แดง,น้ำเงิน,เขียว',
        keywords: 'สุ่ม random pick',
    },
    {
        name: 'gethelp',
        category: 'info',
        summary: 'ดูคำสั่งที่ใช้ได้ในเซิร์ฟนี้',
        detail: 'แสดงรายการคำสั่งทั้งหมดที่ใช้ได้ในเซิร์ฟที่พิมพ์ เซิร์ฟหลักจะเห็นคำสั่งพิเศษเพิ่มมา',
        keywords: 'help ช่วยเหลือ คำสั่ง',
    },
    {
        name: 'userinfo',
        category: 'info',
        summary: 'ข้อมูลบัญชีของสมาชิก',
        detail: 'บอกวันที่สร้างบัญชี วันที่เข้าเซิร์ฟ และยศที่มี',
        options: [{ name: 'target', description: 'สมาชิกที่อยากดู เว้นว่าง = ของตัวเอง' }],
        example: '/userinfo target:@เพื่อน',
        keywords: 'user profile',
    },
    {
        name: 'serverinfo',
        category: 'info',
        summary: 'ข้อมูลของเซิร์ฟนี้',
        detail: 'สรุปข้อมูลของเซิร์ฟที่พิมพ์คำสั่ง',
        keywords: 'server guild',
    },
    {
        name: 'botinfo',
        category: 'info',
        summary: 'สถานะของบอท',
        detail: 'บอทเปิดมานานเท่าไร ใช้ RAM / CPU เท่าไร และรันบน OS อะไร',
        keywords: 'uptime status ram cpu',
    },
    {
        name: 'ping',
        category: 'info',
        summary: 'เช็คว่าบอทตอบช้าแค่ไหน',
        detail: 'วัดเวลาตอบสนองของบอทและการเชื่อมต่อกับ Discord',
        keywords: 'latency lag แลค',
    },
    {
        name: 'verify',
        category: 'home',
        summary: 'ยืนยันรุ่นเพื่อรับยศ',
        detail: 'เลือกรุ่นของตัวเองแล้วใส่รหัสผ่านที่ได้จากแอดมิน ถ้ารหัสถูกจะได้ยศรุ่นนั้น',
        notes: ['ใส่รหัสผิด 5 ครั้งใน 15 นาที ต้องรอก่อนลองใหม่'],
        keywords: 'ยืนยันตัวตน รุ่น',
    },
    {
        name: 'addroles',
        category: 'home',
        summary: 'รับยศพิเศษด้วยรหัสผ่าน',
        detail: 'รับยศพิเศษ (บัตร VIP) ด้วยรหัสผ่าน ถ้ามียศอยู่แล้ว ใส่รหัสอีกรอบจะเป็นการถอดยศออก',
        notes: ['ใส่รหัสผิด 5 ครั้งใน 15 นาที ต้องรอก่อนลองใหม่'],
        keywords: 'vip ยศ role',
    },
    {
        name: 'setuproles',
        category: 'home',
        summary: 'ส่งข้อความรับยศด้วย reaction',
        detail: 'ส่งข้อความพร้อม reaction ในห้องที่พิมพ์ สมาชิกกด reaction เพื่อรับหรือเอายศรุ่นออก',
        keywords: 'reaction role ยศ',
    },
    {
        name: 'admininfo',
        category: 'home',
        summary: 'ข้อมูลผู้สร้างบอท',
        detail: 'แสดงข้อมูลของผู้สร้างบอท',
        keywords: 'admin ผู้สร้าง',
    },
];

export interface TeamMember {
    name: string;
    github: string;
    role: string;
    description: string;
}

export const TEAM: TeamMember[] = [
    {
        name: 'Arlif Thongrakjan',
        github: 'NTZ9008',
        role: 'คนเริ่มโปรเจกต์ · AT Tech',
        description: 'เริ่มทำบอทตัวนี้',
    },
    {
        name: 'โปรแกรมเมอร์แต่งของแทร่ลู่ๆกันอยู่',
        github: 'boatngin',
        role: 'ร่วมพัฒนา',
        description: 'ทำฟีเจอร์และ Dashboard',
    },
];
