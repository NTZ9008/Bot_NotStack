import { EN_PAGES } from './i18n-en-pages';

// คำแปลภาษาอังกฤษ — key คือข้อความภาษาไทยตามที่เขียนในโค้ด (ตรงตัวทุกตัวอักษร) ; เนื้อหาแต่ละหน้าอยู่ใน i18n-en-pages.ts
export const EN: Record<string, string> = {
    ...EN_PAGES,
    // เมนูซ้าย / โครงหน้า
    ภาพรวม: 'Overview',
    ตั้งค่าพื้นฐาน: 'Basics',
    สื่อสารกับสมาชิก: 'Members & messages',
    ดูแลเซิร์ฟเวอร์: 'Moderation',
    'ข้อมูล & ประวัติ': 'Data & history',
    ระบบ: 'System',
    เซิร์ฟเวอร์: 'Server',
    เลือกเซิร์ฟเวอร์: 'Select a server',
    ดูเซิร์ฟเวอร์ทั้งหมด: 'View all servers',
    จัดการได้: 'Can manage',
    ดูอันดับได้อย่างเดียว: 'View rankings only',
    '{count} เซิร์ฟเวอร์': '{count} servers',
    ยังไม่มีเซิร์ฟเวอร์ที่เข้าถึงได้: 'No servers available yet',
    เชิญบอทเข้าเซิร์ฟเวอร์ของคุณ: 'Invite the bot to your server',
    ทางลัด: 'Shortcuts',
    บัญชีของฉัน: 'My account',
    ออกจากระบบ: 'Log out',
    'ยืนยันการออกจากระบบ?': 'Log out?',
    'คุณต้องการออกจากระบบ Dashboard ใช่หรือไม่': 'Do you want to log out of the dashboard?',
    ธีม: 'Theme',
    สว่าง: 'Light',
    มืด: 'Dark',
    สีเดิม: 'Classic',
    ภาษา: 'Language',
    'ค้นหา หรือพิมพ์คำสั่ง...': 'Search or type a command...',
    กำลังเปิดหน้า: 'Opening page',
    วิธีใช้งาน: 'How to use',

    // ปฏิทิน / ช่องวันเวลา
    เลือกวันที่: 'Pick a date',
    เลือกเวลา: 'Pick a time',
    วันนี้: 'Today',
    ตอนนี้: 'Now',
    ล้าง: 'Clear',
    ตกลง: 'Done',
    ชั่วโมง: 'Hour',
    นาที: 'Minute',
    ยังไม่ได้เลือก: 'Not set',

    // ชื่อหน้า
    เซิร์ฟเวอร์ทั้งหมด: 'All servers',
    เซิร์ฟเวอร์ของคุณ: 'Your servers',
    ภาพรวมเซิร์ฟเวอร์: 'Server overview',
    ตั้งค่าบอท: 'Bot settings',
    'ตั้งค่า AI Chat': 'AI Chat settings',
    ส่งประกาศ: 'Announcements',
    ต้อนรับสมาชิกใหม่: 'Welcome new members',
    รายงานสภาพอากาศ: 'Weather report',
    ให้สิทธิ์เข้าห้อง: 'Room access',
    ดูแลห้องเสียง: 'Voice guard',
    ฟังห้องเสียง: 'Voice listen',
    ตั้งค่าบันทึกเหตุการณ์: 'Event log settings',
    'แจ้งเตือน GitHub PR': 'GitHub PR alerts',
    'แจ้งเตือน Grafana Alert': 'Grafana alerts',
    'เปิด Jira card': 'Jira cards',
    เก็บเงินตามเป้า: 'Fund collection',
    อันดับและเลเวล: 'Ranks & levels',
    กระดานความสัมพันธ์: 'Relations board',
    ประวัติเซิร์ฟเวอร์: 'Server history',
    สร้างรายงานสรุป: 'Summary report',
    จัดการผู้ใช้: 'Users',
    ประวัติทั้งระบบ: 'System history',
    ไฟล์บันทึกของบอท: 'Bot log files',

    // คำอธิบายหน้า
    'การ์ดต้อนรับสมาชิกใหม่แบบรูปภาพ — ใส่รูปพื้นหลัง รูปโปรไฟล์ ชื่อ และข้อความ แล้วเลือกห้องที่จะส่ง':
        'Image welcome cards for new members — set a background, avatar, name and message, then pick the channel to post in.',
    'ข้อมูลบัญชี การเชื่อมต่อ Discord และความปลอดภัย': 'Account details, Discord connection and security.',
    'จัดการ Gemini API Key และติดตามโควตาการใช้งาน AI ของเซิร์ฟเวอร์นี้': 'Manage the Gemini API key and track this server’s AI usage quota.',
    'จัดการ Whitelist / Blacklist สำหรับห้องเสียง — คนที่ไม่มีสิทธิ์จะถูกเตะออกจากห้องทันทีที่เข้า':
        'Manage the voice channel whitelist / blacklist — anyone without access is kicked as soon as they join.',
    'จัดการผู้ใช้ Dashboard — กำหนด role, ปิดบัญชี, รีเซ็ตรหัสผ่าน และบังคับออกจากระบบ':
        'Manage dashboard users — set roles, disable accounts, reset passwords and force logout.',
    'ดูประวัติการทำงานและแจ้งเตือนต่างๆ ของบอท (ข้อความแชท / เข้า-ออกห้องเสียง)': 'Bot activity and notifications (chat messages / voice joins and leaves).',
    'ดูว่าใครเกี่ยวข้องกับใคร จากประวัติห้องเสียง แชท และการลงมือของแอดมินในเซิร์ฟเวอร์':
        'See who is connected to whom, from voice history, chat and admin actions in the server.',
    'ตั้งค่าห้องแจ้งเตือน Pull Request แยกตาม organization และ mention role แยกตาม repo':
        'Set the Pull Request alert channel per organization and the role to mention per repo.',
    'ติดตามเหตุการณ์สำคัญ ออกแบบข้อความให้อ่านง่าย และเลือกห้องรับแจ้งเตือน': 'Track important events, design readable messages and pick the alert channel.',
    'ทุกการกระทำบน Dashboard ทั้งระบบ — การเข้าสู่ระบบ จัดการผู้ใช้ และการตั้งค่าของทุกเซิร์ฟเวอร์':
        'Every dashboard action system-wide — logins, user management and settings for every server.',
    'ประกาศสำหรับเซิร์ฟเวอร์ {name} — จัดรูปแบบข้อความและดูตัวอย่างก่อนส่งจริง': 'Announcements for {name} — format the message and preview it before sending.',
    'ประวัติของเซิร์ฟเวอร์นี้ — ทั้งการตั้งค่าที่แก้ผ่าน Dashboard และเหตุการณ์ที่เกิดในเซิร์ฟเวอร์ Discord':
        'This server’s history — settings changed in the dashboard and events in the Discord server.',
    'ภาพรวมความเคลื่อนไหวในเซิร์ฟเวอร์ — เข้า/ออกเซิร์ฟเวอร์ เข้า/ออกห้องเสียง และใครเคลื่อนไหวมากที่สุด':
        'Server activity at a glance — joins/leaves, voice joins/leaves and the most active members.',
    'ระบบประสบการณ์ของ {name} — อันดับ การ์ด /rank กฎกิจกรรม และประวัติ XP': 'XP system for {name} — leaderboard, /rank card, activity rules and XP history.',
    'รับสถานะ Alertmanager และส่งต่อไปยังห้อง Discord ของเซิร์ฟเวอร์นี้': 'Receive Alertmanager status and forward it to this server’s Discord channel.',
    'รายงานสภาพอากาศประจำวันแบบ embed พร้อมกราฟพยากรณ์และแผนที่เรดาร์ฝน — ตั้งเวลา ห้อง สถานที่ และข้อมูลที่จะแสดงได้ที่นี่':
        'Daily weather embed with a forecast chart and rain radar map — set the time, channel, location and fields here.',
    'สรุปสถิติห้องเสียง ข้อความ GitHub PR และ DevOps แบบกำหนดเงื่อนไขได้เองสำหรับ {name}': 'Custom voice, message, GitHub PR and DevOps statistics for {name}.',
    'สร้างหัวข้อ ตั้งยอดคงที่หรือรายวัน จัดการสมาชิก บันทึกรับเงิน ดูสรุป และส่งรายงานเข้า Discord':
        'Create topics, set a fixed or daily amount, manage members, record payments, see summaries and post reports to Discord.',
    'ห้องที่บอทใช้ และความสามารถของบอทในเซิร์ฟเวอร์นี้ — บันทึกทันทีที่เปลี่ยน':
        'Channels the bot uses and its features in this server — saved as soon as you change them.',
    'เลือกเซิร์ฟเวอร์ที่จะตั้งค่าบอท — แสดงเฉพาะเซิร์ฟเวอร์ของคุณที่บอทอยู่ (เป็นเจ้าของเซิร์ฟเวอร์หรือมีสิทธิ์ Manage Server)':
        'Pick a server to configure — only servers you own or can Manage Server that have the bot are shown.',
    'ให้บอทเข้าห้องเสียงแล้วฟังเสียงในห้องสดๆ ผ่านหน้าเว็บ': 'Have the bot join a voice channel and listen live in the browser.',
    'ให้สมาชิกเปิด card ใน Jira จาก Discord แบบระบบ ticket — กดปุ่มในห้องแผง บอทสร้างห้องส่วนตัวให้เลือกประเภทและกรอกหัวข้อ/รายละเอียด แล้วส่งลิงก์ card กลับมา':
        'Let members open Jira cards from Discord like a ticket system — press the panel button, the bot opens a private channel to pick a type and fill in details, then replies with the card link.',
    'ให้สิทธิ์ผู้ใช้ในการมองเห็นห้องพิเศษ — ถาวร หรือจำกัดเวลา (บอทถอนสิทธิ์และแจ้งเตือนทาง DM ให้เอง)':
        'Grant users access to special channels — permanently or for a limited time (the bot revokes access and DMs them automatically).',

    // วิธีบันทึก (ใต้ชื่อหน้า)
    'การตั้งค่าต้องกดบันทึก ส่วนสวิตช์เปิด/ปิดบันทึกทันทีและใช้ค่าที่บันทึกไว้':
        'Settings need Save; the on/off switch saves immediately and uses the saved settings.',
    'การตั้งค่าแต่ละแท็บมีปุ่มบันทึกของตัวเอง ตรวจและบันทึกก่อนออกจากแท็บ': 'Each tab has its own Save button — save before leaving the tab.',
    'การประมวลผลและส่งออกรายงานไม่เปลี่ยนแปลงข้อมูลต้นฉบับ โดยระบบจะบันทึกเฉพาะประวัติการส่งออก PDF':
        'Processing and exporting never change the source data; only PDF export history is recorded.',
    'การสร้าง/แก้ไขหัวข้อและบันทึกรับเงินมีผลทันที รายงานจะถูกส่งเข้าห้องเมื่อกดส่ง':
        'Creating/editing topics and recording payments take effect immediately; reports are posted when you press Send.',
    การเปลี่ยนช่วงเวลาและตัวกรองมีผลเฉพาะข้อมูลที่แสดง: 'Changing the time range and filters only affects what is shown.',
    การเปลี่ยนสิทธิ์และสถานะบัญชีมีผลเมื่อดำเนินการสำเร็จ: 'Role and account status changes apply once the action succeeds.',
    การเลือกเซิร์ฟเวอร์ยังไม่เปลี่ยนการตั้งค่าบอท: 'Selecting a server does not change any bot settings.',
    'การแก้การ์ดต้องกดบันทึก ส่วนสวิตช์เปิด/ปิดบันทึกทันที': 'Card edits need Save; the on/off switch saves immediately.',
    'บันทึกทันทีเมื่อเลือกห้องหรือเปิด/ปิดสวิตช์ ไม่ต้องกดปุ่มบันทึก': 'Saved as soon as you pick a channel or flip a switch — no Save button needed.',
    'บันทึกห้องเริ่มต้นและ label mapping แยกตามเซิร์ฟเวอร์': 'The default channel and label mapping are saved per server.',
    'ปุ่มดำเนินการเปลี่ยนสิทธิ์จริงใน Discord ตรวจรายชื่อผู้ได้รับสิทธิ์ด้านล่างได้':
        'Action buttons change real Discord permissions; check who has access below.',
    'ปุ่มทุกปุ่มมีผลทันที ไม่ต้องกดบันทึก': 'Every button takes effect immediately — no Save needed.',
    'ส่งข้อความจริงหลังยืนยัน แบบร่างในหน้านี้ไม่ได้บันทึกอัตโนมัติ': 'Messages are sent for real after you confirm; drafts on this page are not saved.',
    'หน้านี้อ่านข้อมูลจากไฟล์ ไม่มีการแก้ไขไฟล์บันทึก': 'This page only reads log files; nothing is modified.',
    'หน้านี้ใช้ดูข้อมูล ตำแหน่งการ์ดที่ลากจะจำไว้ในเบราว์เซอร์นี้เท่านั้น': 'View only — dragged card positions are remembered in this browser only.',
    'หน้านี้ใช้ดูประวัติ การกรองไม่เปลี่ยนข้อมูลต้นฉบับ': 'View only — filtering never changes the source data.',
    'เพิ่ม/ลบสมาชิกและเปลี่ยนสวิตช์มีผลทันที ไม่ต้องกดบันทึก': 'Adding/removing members and switches apply immediately — no Save needed.',
    'เหตุการณ์ ห้อง และตัวกรองบันทึกทันที ส่วนรูปแบบข้อความต้องกดบันทึก': 'Events, channels and filters save immediately; message formatting needs Save.',
    'แก้ค่าแล้วกดบันทึก (Ctrl/⌘ + S) · สวิตช์เปิด/ปิดบันทึกทันที · ส่งแผงใช้ค่าที่บันทึกแล้ว':
        'Edit then Save (Ctrl/⌘ + S) · the on/off switch saves immediately · sending the panel uses saved settings.',
    'แต่ละการดำเนินการมีปุ่มแยกกัน อ่านข้อความยืนยันก่อนดำเนินการ': 'Each action has its own button — read the confirmation before continuing.',
    'แต่ละส่วนมีปุ่มบันทึกของตัวเอง ต้องบันทึกทุกส่วนที่แก้': 'Each section has its own Save button — save every section you edit.',

    // สรุปสั้นของแต่ละหน้า (ช่องค้นหา ⌘K / ทางลัด)
    'กำหนดว่าใครเข้าได้ หรือห้ามใครเข้าห้องเสียง': 'Decide who may or may not join voice channels.',
    'จัดการบัญชี การเชื่อมต่อ Discord และความปลอดภัย': 'Manage your account, Discord connection and security.',
    'จัดการบัญชีและสิทธิ์เข้าใช้ Dashboard': 'Manage dashboard accounts and access.',
    'ดูว่าสมาชิกคนไหนเกี่ยวข้องกัน และเปิดประวัติของแต่ละคนหรือแต่ละเส้นได้': 'See which members are connected and open the history of each person or link.',
    'ดูอันดับ XP และปรับแต่งการ์ดของคุณ': 'See the XP leaderboard and customize your card.',
    ตรวจการเข้าสู่ระบบและการเปลี่ยนแปลงจากทุกเซิร์ฟเวอร์: 'Review logins and changes across all servers.',
    'ตรวจว่าใครเปลี่ยนการตั้งค่าและเกิดอะไรขึ้นใน Discord': 'See who changed settings and what happened in Discord.',
    'ตั้งเวลาส่งรายงานอากาศ พร้อมพยากรณ์และเรดาร์ฝน': 'Schedule weather reports with forecast and rain radar.',
    'รับ Alertmanager แล้วส่งสถานะ Firing และ Resolved ไปยัง Discord': 'Receive Alertmanager and post Firing / Resolved status to Discord.',
    สร้างข้อความและการ์ดต้อนรับเมื่อสมาชิกเข้าเซิร์ฟเวอร์: 'Create welcome messages and cards for new members.',
    'สร้างรายงานสรุปสถิติห้องเสียง ข้อความ GitHub PR และ DevOps ตามเงื่อนไขพร้อมส่งออก PDF ภาษาไทย':
        'Build voice, message, GitHub PR and DevOps summary reports and export them as Thai PDF.',
    'สร้างหัวข้อเก็บเงิน ตั้งยอดต่อคน เพิ่ม/ลบคน บันทึกรับเงิน และส่งรายงานเข้า Discord':
        'Create fund topics, set per-person amounts, manage members, record payments and post reports to Discord.',
    'ส่งความเคลื่อนไหวของ Pull Request เข้าห้อง Discord': 'Post Pull Request activity to a Discord channel.',
    'เขียนข่าวและดูตัวอย่างก่อนส่งเข้า Discord': 'Write news and preview it before posting to Discord.',
    เปิดไฟล์บันทึกเพื่อตรวจการทำงานของบอท: 'Open log files to check what the bot is doing.',
    เริ่มตั้งค่าบอทและดูความเคลื่อนไหวของสมาชิก: 'Start setting up the bot and see member activity.',
    เลือกห้องปลายทางและเปิดความสามารถของบอท: 'Pick target channels and turn on bot features.',
    เลือกเซิร์ฟเวอร์ที่ต้องการใช้งานก่อนเริ่มตั้งค่าบอท: 'Pick a server before setting up the bot.',
    'เลือกเหตุการณ์และห้องรับแจ้งเตือน พร้อมปรับรูปแบบข้อความ': 'Pick events and alert channels and style the messages.',
    'ให้บอทเข้าห้องเสียงแล้วฟังเสียงในห้องสดๆ ผ่านหน้าเว็บนี้': 'Have the bot join a voice channel and listen live on this page.',
    'ให้สมาชิกเปิด card ใน Jira จาก Discord ผ่านห้องส่วนตัวแบบระบบ ticket': 'Let members open Jira cards from Discord through private ticket channels.',
    ให้หรือถอนสิทธิ์มองเห็นห้องพิเศษแบบถาวรหรือจำกัดเวลา: 'Grant or revoke access to special channels, permanently or for a limited time.',
};
