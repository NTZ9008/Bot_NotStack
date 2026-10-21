import type { LucideIcon } from 'lucide-react';
import {
    Bot,
    CloudSun,
    Coins,
    GitPullRequest,
    Image,
    LineChart,
    Lock,
    Megaphone,
    MessageSquareWarning,
    Mic,
    ScrollText,
    ShieldAlert,
    Sparkles,
    Ticket,
    Trophy,
    Vote,
} from 'lucide-react';

// ==========================================
// 📄 เนื้อหาหน้า landing — ความสามารถ / คำสั่ง / ทีมผู้พัฒนา (อัปเดตที่นี่ที่เดียวเมื่อเพิ่มฟีเจอร์ใหม่)
// ==========================================

export const REPO_URL = 'https://github.com/NTZ9008/Bot_NotStack';

export interface Feature {
    icon: LucideIcon;
    title: string;
    description: string;
    points: string[];
}

export interface FeatureGroup {
    id: string;
    label: string;
    tagline: string;
    features: Feature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
    {
        id: 'security',
        label: 'ความปลอดภัยและดูแลเซิร์ฟเวอร์',
        tagline: 'กันคนป่วน กันสแปม และคุมสิทธิ์ห้องได้ละเอียด',
        features: [
            {
                icon: ShieldAlert,
                title: 'Voice Monitor',
                description: 'แจ้งห้อง security ทันทีเมื่อมีคนเปลี่ยน bitrate หรือ region ของห้องเสียง พร้อมบอกว่าใครเป็นคนทำ',
                points: ['อ่านชื่อผู้ทำจาก audit log', 'จับคนแกล้งทำให้เสียงแลค'],
            },
            {
                icon: Mic,
                title: 'Voice Guard',
                description: 'ตั้ง whitelist / blacklist แยกรายห้องเสียง คนที่ไม่มีสิทธิ์จะถูกตัดออกจากห้องทันที',
                points: ['เลือกได้ทั้งสมาชิกและยศ', 'ส่งข้อความบอกเหตุผลให้คนที่ถูกตัด'],
            },
            {
                icon: MessageSquareWarning,
                title: 'Anti-spam และกรองคำหยาบ',
                description: 'ลบข้อความเมื่อส่งเกิน 6 ข้อความใน 5 วินาที และกรองคำหยาบภาษาไทยโดยให้ AI ช่วยตัดสินคำที่กำกวม',
                points: ['คำหยาบชัดเจนลบทันที', 'คำก้ำกึ่งให้ Gemini ดูบริบทก่อน'],
            },
            {
                icon: Lock,
                title: 'Room Access',
                description: 'ให้สมาชิกเข้าห้องส่วนตัวแบบถาวรหรือจำกัดเวลา แล้วถอนสิทธิ์ให้อัตโนมัติเมื่อหมดเวลา',
                points: ['DM เตือนก่อนหมดเวลา 5 นาที', 'ถอนเฉพาะสิทธิ์ที่บอทให้ไป'],
            },
        ],
    },
    {
        id: 'community',
        label: 'สร้างชุมชนให้คึกคัก',
        tagline: 'ให้สมาชิกอยากคุย อยากเข้าห้องเสียง และกลับมาบ่อยๆ',
        features: [
            {
                icon: Sparkles,
                title: 'AI Chat (Google Gemini)',
                description: 'แท็กบอทแล้วถามได้ทุกเรื่อง ตอบเป็นภาษาไทยแบบเป็นกันเอง ไม่ตอบเนื้อหาผิดกฎหมายหรือ 18+',
                points: ['มีโควตาต่อวันแยกรายเซิร์ฟเวอร์', 'คำตอบของ AI แท็กใครไม่ได้'],
            },
            {
                icon: Trophy,
                title: 'เลเวลและการ์ดอันดับ',
                description: 'สะสม XP จากการพิมพ์ เข้าห้องเสียง และใช้คำสั่ง พร้อมการ์ดอันดับและ leaderboard แบบรูปภาพ',
                points: ['ตั้งตัวคูณ คูลดาวน์ และเพดานต่อวันได้', 'ยศรางวัลตามเลเวลสูงสุด 25 ยศ', 'สมาชิกแต่งการ์ดของตัวเองได้'],
            },
            {
                icon: Image,
                title: 'การ์ดต้อนรับสมาชิกใหม่',
                description: 'ข้อความต้อนรับ / ลาก่อน และการ์ดรูปภาพที่ใส่พื้นหลัง รูปโปรไฟล์ และข้อความได้ถึง 12 ชั้น',
                points: ['ดูตัวอย่างจริงก่อนบันทึก', 'มีคลังรูปพื้นหลังของแต่ละเซิร์ฟเวอร์'],
            },
            {
                icon: Megaphone,
                title: 'ประกาศข่าว',
                description: 'เขียนประกาศด้วย Discord markdown ในรูปแบบ embed เห็นหน้าตาก่อนส่งเข้าห้องจริง',
                points: ['ใส่รูป สี และลิงก์ได้', 'พรีวิวแบบเดียวกับใน Discord'],
            },
            {
                icon: Vote,
                title: 'โพล สุ่ม และยศอัตโนมัติ',
                description: 'โพลแบบไม่เปิดเผยชื่อ คำสั่งสุ่ม reaction roles และคำตอบอัตโนมัติ',
                points: ['โหวตใหม่ = เปลี่ยนคำตอบ', 'รับยศด้วยการกด reaction'],
            },
            {
                icon: CloudSun,
                title: 'รายงานสภาพอากาศรายวัน',
                description: 'ส่งรายงานอากาศตามเวลาที่ตั้ง มีอุณหภูมิ โอกาสฝน PM2.5 กราฟพยากรณ์ และเรดาร์ฝนแบบเคลื่อนไหว',
                points: ['ข้อมูลจาก OpenWeatherMap', 'เรียกดูเองได้ด้วย /weather'],
            },
        ],
    },
    {
        id: 'team',
        label: 'เครื่องมือสำหรับทีม',
        tagline: 'ใช้ Discord เป็นศูนย์กลางของทีมพัฒนาและกลุ่มเพื่อน',
        features: [
            {
                icon: GitPullRequest,
                title: 'แจ้งเตือน GitHub PR',
                description: 'ส่ง Pull Request เข้า Discord แล้วอัปเดตข้อความเดิมเมื่อมีคน approve, ขอแก้ไข, CI ผ่าน/ไม่ผ่าน หรือ merge',
                points: ['ข้อความเดียวต่อ PR ไม่รก', 'webhook และ secret แยกรายเซิร์ฟเวอร์'],
            },
            {
                icon: Ticket,
                title: 'เปิด Jira card',
                description: 'สมาชิกเปิด card ใน Jira จาก Discord ผ่านห้องส่วนตัวแบบระบบ ticket',
                points: ['แนบรูปจาก Discord ได้', 'ไม่ต้องให้ทุกคนมีบัญชี Jira'],
            },
            {
                icon: Coins,
                title: 'เก็บเงินตามเป้า',
                description: 'สร้างหัวข้อเก็บเงิน ตั้งยอดต่อคน บันทึกการรับเงิน และส่งรายงานความคืบหน้าเข้า Discord',
                points: ['ดูได้ว่าใครจ่ายแล้ว ใครยังค้าง', 'เพิ่ม / ลบคนได้ตลอด'],
            },
        ],
    },
    {
        id: 'insight',
        label: 'บันทึกและสถิติ',
        tagline: 'รู้ว่าเกิดอะไรขึ้นในเซิร์ฟเวอร์ ย้อนดูได้ทุกเมื่อ',
        features: [
            {
                icon: ScrollText,
                title: 'Log Manager',
                description: 'เลือกเหตุการณ์ที่จะบันทึกและห้องที่รับ เช่น เข้า/ออก ห้องเสียง แบน แก้/ลบข้อความ ยศ ห้อง และ AutoMod',
                points: ['ปรับหน้าตาข้อความ log ได้', 'กรองบอทหรือห้องที่ไม่ต้องการ'],
            },
            {
                icon: LineChart,
                title: 'ภาพรวมเซิร์ฟเวอร์',
                description: 'กราฟคนเข้า/ออก กิจกรรมในห้องเสียง สมาชิกที่แอคทีฟที่สุด และเวลาที่ใช้ในห้องเสียง',
                points: ['เก็บข้อมูลไว้ในฐานข้อมูล', 'เลือกช่วงเวลาที่ต้องการดูได้'],
            },
            {
                icon: Bot,
                title: 'ประวัติการตั้งค่า',
                description: 'บันทึกว่าใครเปลี่ยนการตั้งค่าอะไร เมื่อไร และจาก IP ไหน ตรวจย้อนหลังได้ครบ',
                points: ['แยกตามเซิร์ฟเวอร์', 'แอดมินระบบดูได้ทุกเซิร์ฟเวอร์'],
            },
        ],
    },
];

export interface Command {
    name: string;
    description: string;
    homeOnly?: boolean;
}

export const COMMANDS: Command[] = [
    { name: '/gethelp', description: 'ดูคำสั่งทั้งหมดที่ใช้ได้ในเซิร์ฟเวอร์นี้' },
    { name: '/rank [target]', description: 'การ์ดอันดับ: เลเวล XP และหลอดความคืบหน้า' },
    { name: '/leaderboard [page]', description: 'ตารางอันดับแบบรูปภาพ หน้าละ 10 คน' },
    { name: '/rankcard', description: 'แต่งการ์ดอันดับของคุณ: แบบการ์ด สี และพื้นหลัง' },
    { name: '/xp history [member]', description: 'ประวัติ XP 10 รายการล่าสุด และ XP วันนี้' },
    { name: '/weather [city]', description: 'รายงานอากาศ พร้อมกราฟพยากรณ์และเรดาร์ฝน' },
    { name: '/poll question choices', description: 'สร้างโพลแบบไม่เปิดเผยชื่อ' },
    { name: '/random items', description: 'สุ่มเลือกหนึ่งอย่างจากรายการ' },
    { name: '/userinfo [target]', description: 'วันสร้างบัญชี วันเข้าเซิร์ฟเวอร์ และยศ' },
    { name: '/serverinfo', description: 'ข้อมูลของเซิร์ฟเวอร์นี้' },
    { name: '/botinfo', description: 'สถานะบอท: uptime, RAM, CPU และ OS' },
    { name: '/ping', description: 'เช็คความเร็วการตอบสนอง' },
    { name: '/verify', description: 'ยืนยันตัวตนด้วยรหัสผ่านของรุ่น', homeOnly: true },
    { name: '/addroles', description: 'รับยศพิเศษด้วยรหัสผ่าน', homeOnly: true },
    { name: '/setuproles', description: 'ส่งข้อความรับยศด้วย reaction', homeOnly: true },
    { name: '/admininfo', description: 'ข้อมูลผู้พัฒนา', homeOnly: true },
];

// เมนูใน Dashboard ที่โชว์บนหน้า landing (ตรงกับหน้าใน nav-items)
export const DASHBOARD_PAGES = [
    'ภาพรวมเซิร์ฟเวอร์',
    'ตั้งค่าบอท',
    'ส่งประกาศ',
    'ต้อนรับสมาชิกใหม่',
    'รายงานสภาพอากาศ',
    'ให้สิทธิ์เข้าห้อง',
    'ดูแลห้องเสียง',
    'ตั้งค่าบันทึกเหตุการณ์',
    'แจ้งเตือน GitHub PR',
    'เปิด Jira card',
    'เก็บเงินตามเป้า',
    'อันดับและเลเวล',
    'ประวัติเซิร์ฟเวอร์',
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
        role: 'ผู้สร้างโปรเจกต์ · AT Tech',
        description: 'เริ่มต้น Bot_NotStack เป็นบอทประจำชุมชน NotStackOverflow และดูแลโครงสร้างหลักของระบบ',
    },
    {
        name: 'Thanapat Julakarn',
        github: 'boatngin',
        role: 'Core contributor',
        description: 'ร่วมพัฒนาความสามารถของบอทและ Dashboard',
    },
];
