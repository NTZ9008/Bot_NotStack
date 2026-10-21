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
        intro: 'จุดเริ่มต้นของบอทตัวนี้จริงๆ — เซิร์ฟเราเคยโดนแกล้งเปลี่ยน bitrate ห้องเสียงจนคุยกันไม่รู้เรื่อง',
        features: [
            {
                title: 'Voice Monitor',
                description: 'ใครเปลี่ยน bitrate หรือ region ของห้องเสียง บอทจะแจ้งห้อง security พร้อมบอกว่าใครเป็นคนเปลี่ยน (อ่านจาก audit log)',
            },
            {
                title: 'Voice Guard',
                description: 'ตั้ง whitelist / blacklist แยกรายห้องเสียง คนที่ไม่มีสิทธิ์เข้าไปจะถูกตัดออก และบอทจะบอกเหตุผลให้',
            },
            {
                title: 'Anti-spam',
                description: 'ส่งเกิน 6 ข้อความใน 5 วินาที ข้อความจะถูกลบและแจ้งห้อง security',
            },
            {
                title: 'กรองคำหยาบ',
                description: 'คำที่หยาบชัดๆ ลบทันที ส่วนคำที่ก้ำกึ่งจะให้ Gemini ดูบริบทก่อน เพราะภาษาไทยเขียนติดกัน ถ้าจับแค่คำจะโดนคำธรรมดาไปเยอะ',
            },
            {
                title: 'Room Access',
                description: 'ให้สิทธิ์เข้าห้องส่วนตัวแบบถาวรหรือมีวันหมดอายุ บอท DM เตือนก่อนหมด 5 นาที แล้วถอนสิทธิ์ให้เอง',
            },
        ],
    },
    {
        id: 'community',
        label: 'ทำให้เซิร์ฟมีชีวิต',
        intro: 'ของที่ทำให้คนอยากเข้ามาคุยและเข้าห้องเสียงบ่อยขึ้น',
        features: [
            {
                title: 'เลเวลและการ์ดอันดับ',
                description:
                    'ได้ XP จากการพิมพ์ เข้าห้องเสียง และใช้คำสั่ง แอดมินปรับตัวคูณ คูลดาวน์ เพดานต่อวัน และยศรางวัลได้ (สูงสุด 25 ยศ) สมาชิกแต่งการ์ด /rank ของตัวเองได้',
            },
            {
                title: 'แชทกับ AI',
                description: 'แท็กบอทแล้วถามได้เลย ตอบแบบเพื่อนคุยกัน มีโควตาต่อวันแยกแต่ละเซิร์ฟ คำตอบของ AI แท็กใครไม่ได้',
            },
            {
                title: 'การ์ดต้อนรับ',
                description: 'ข้อความต้อนรับ / ลาก่อน และการ์ดรูปที่ใส่พื้นหลังกับข้อความได้ถึง 12 ชั้น ดูตัวอย่างจริงจากเซิร์ฟเวอร์ก่อนบันทึก',
            },
            {
                title: 'ประกาศ',
                description: 'เขียนประกาศเป็น embed ด้วย Discord markdown เห็นหน้าตาก่อนกดส่ง',
            },
            {
                title: 'รายงานอากาศ',
                description: 'ส่งรายงานอากาศทุกวันตามเวลาที่ตั้ง มีกราฟพยากรณ์ PM2.5 และเรดาร์ฝน หรือเรียกเองด้วย /weather',
            },
            {
                title: 'โพล สุ่ม ยศจาก reaction',
                description: 'ของเล็กๆ ที่ใช้บ่อย — โพลไม่เปิดเผยชื่อ สุ่มของ และรับยศด้วยการกด reaction',
            },
        ],
    },
    {
        id: 'team',
        label: 'ใช้ทำงานกับทีม',
        intro: 'พวกเราใช้ Discord ทำโปรเจกต์ด้วยกัน เลยใส่ของที่ทีมเราใช้จริงเข้าไป',
        features: [
            {
                title: 'แจ้งเตือน GitHub PR',
                description: 'PR หนึ่งอัน = ข้อความเดียว บอทแก้ข้อความเดิมเรื่อยๆ ว่าใคร approve ใครขอแก้ CI ผ่านไหม และ merge หรือยัง',
            },
            {
                title: 'เปิด Jira card',
                description: 'สมาชิกเปิด card ใน Jira จาก Discord ผ่านห้อง ticket ส่วนตัว ไม่ต้องให้ทุกคนมีบัญชี Jira',
            },
            {
                title: 'เก็บเงิน',
                description: 'ตั้งหัวข้อและยอดต่อคน บันทึกว่าใครจ่ายแล้ว แล้วส่งสรุปเข้าห้อง — ไม่ต้องทวงกันในแชทอีก',
            },
        ],
    },
    {
        id: 'logs',
        label: 'ย้อนดูได้ว่าเกิดอะไรขึ้น',
        intro: 'เวลามีเรื่อง จะได้ไม่ต้องเดา',
        features: [
            {
                title: 'Log Manager',
                description: 'เลือกเองว่าจะเก็บเหตุการณ์ไหนไปห้องไหน เช่น เข้า/ออก ห้องเสียง แบน แก้/ลบข้อความ ยศ ห้อง AutoMod',
            },
            {
                title: 'ภาพรวมเซิร์ฟเวอร์',
                description: 'กราฟคนเข้า/ออก ใครแอคทีฟที่สุด และใครอยู่ห้องเสียงนานที่สุด',
            },
            {
                title: 'ประวัติการตั้งค่า',
                description: 'ใครเปลี่ยนอะไรใน Dashboard เมื่อไร บันทึกไว้หมด',
            },
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
        description: 'เขียนบอทตัวแรกไว้ใช้ในเซิร์ฟ NotStackOverflow แล้วค่อยๆ โตมาเป็นแบบที่เห็น',
    },
    {
        name: 'Thanapat Julakarn',
        github: 'boatngin',
        role: 'ร่วมพัฒนา',
        description: 'ช่วยทำความสามารถของบอทและหน้า Dashboard',
    },
];
