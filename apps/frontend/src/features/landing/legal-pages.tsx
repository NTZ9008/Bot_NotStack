import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileText, ShieldCheck } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { Button } from '@/components/ui/button';

const SITE_ORIGIN = 'https://bntdash.arlifzs.com';
const LAST_UPDATED = '22 ตุลาคม 2569';

export function usePageMeta({ title, description, path }: { title: string; description: string; path: string }) {
    useEffect(() => {
        const url = `${SITE_ORIGIN}${path}`;
        document.title = title;
        const setMeta = (selector: string, content: string) => {
            const el = document.querySelector<HTMLMetaElement>(selector);
            if (el) el.content = content;
        };
        setMeta('meta[name="description"]', description);
        setMeta('meta[property="og:title"]', title);
        setMeta('meta[property="og:description"]', description);
        setMeta('meta[property="og:url"]', url);
        setMeta('meta[name="twitter:title"]', title);
        setMeta('meta[name="twitter:description"]', description);
        const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        if (canonical) canonical.href = url;
    }, [title, description, path]);
}

function LegalLayout({
    active,
    icon,
    title,
    subtitle,
    children,
}: {
    active: 'privacy' | 'terms';
    icon: ReactNode;
    title: string;
    subtitle: string;
    children: ReactNode;
}) {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;

    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [active]);

    return (
        <div className="min-h-svh bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
                    <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
                        <img src={bot.avatar} alt={bot.name} className="size-7 rounded-full" />
                        <span className="truncate">{bot.name}</span>
                    </Link>
                    <nav className="ml-auto flex items-center gap-4 text-sm">
                        <Link
                            to="/privacy"
                            className={active === 'privacy' ? 'font-medium text-indigo-300' : 'text-muted-foreground hover:text-foreground'}
                        >
                            Privacy Policy
                        </Link>
                        <Link
                            to="/terms"
                            className={active === 'terms' ? 'font-medium text-indigo-300' : 'text-muted-foreground hover:text-foreground'}
                        >
                            Terms of Service
                        </Link>
                        <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                            <Link to="/dashboard">Dashboard</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="size-4" /> กลับหน้าแรก
                </Link>

                <div className="mt-6 border-b pb-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                        {icon}
                        <span>อัปเดตล่าสุด: {LAST_UPDATED}</span>
                    </div>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
                    <p className="mt-2 text-pretty text-muted-foreground">{subtitle}</p>
                </div>

                <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-300">{children}</div>
            </main>

            <footer className="border-t">
                <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        {bot.name}
                        {info?.version ? ` v${info.version}` : ''} · พัฒนาโดยทีม NotStackOverflow (AT Tech)
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <Link to="/" className="hover:text-foreground">
                            หน้าแรก
                        </Link>
                        <Link to="/privacy" className="hover:text-foreground">
                            นโยบายความเป็นส่วนตัว
                        </Link>
                        <Link to="/terms" className="hover:text-foreground">
                            ข้อกำหนดการใช้งาน
                        </Link>
                        <Link to="/dashboard" className="hover:text-foreground">
                            Dashboard →
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function SectionBlock({ number, title, children }: { number: string; title: string; children: ReactNode }) {
    return (
        <section className="space-y-3 rounded-xl border bg-card/40 p-6">
            <h2 className="flex items-baseline gap-2.5 text-lg font-semibold text-foreground">
                <span className="font-mono text-xs text-indigo-300">{number}</span>
                <span>{title}</span>
            </h2>
            <div className="space-y-2.5 text-slate-300">{children}</div>
        </section>
    );
}

export function PrivacyPolicyPage() {
    usePageMeta({
        title: 'นโยบายความเป็นส่วนตัว (Privacy Policy) — Bot_NotStack',
        description:
            'นโยบายความเป็นส่วนตัวของ Bot_NotStack และเว็บ Dashboard อธิบายข้อมูลที่จัดเก็บ การแยกสิทธิ์ตามเซิร์ฟเวอร์ (Role-Based Access Control) มาตรการความปลอดภัย และสิทธิ์ของผู้ใช้งาน',
        path: '/privacy',
    });

    return (
        <LegalLayout
            active="privacy"
            icon={<ShieldCheck className="size-3.5" />}
            title="นโยบายความเป็นส่วนตัว (Privacy Policy)"
            subtitle="เอกสารนี้อธิบายว่า Bot_NotStack และเว็บ Dashboard (bntdash.arlifzs.com) จัดเก็บ ใช้ และปกป้องข้อมูลของคุณและเซิร์ฟเวอร์ Discord ของคุณอย่างไร"
        >
            <SectionBlock number="01" title="ข้อมูลที่เราจัดเก็บ (Information We Collect)">
                <p>เราจัดเก็บเฉพาะข้อมูลที่จำเป็นต่อการทำงานของฟีเจอร์บอทและการยืนยันตัวตนบน Dashboard เท่านั้น ได้แก่:</p>
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>
                        <strong>ข้อมูลเซิร์ฟเวอร์ Discord (Guild Data):</strong> รหัสเซิร์ฟเวอร์ (<code>guildId</code>), ชื่อเซิร์ฟเวอร์, ไอคอนเซิร์ฟเวอร์,
                        รหัสเจ้าของเซิร์ฟเวอร์ (<code>ownerId</code>) และรหัสห้องหรือยศที่ผู้ดูแลเซิร์ฟเวอร์เลือกตั้งค่าไว้
                    </li>
                    <li>
                        <strong>ข้อมูลบัญชีผู้ใช้ Dashboard:</strong> เมื่อคุณเข้าสู่ระบบผ่าน Discord OAuth2 ระบบจะขอสิทธิ์เฉพาะ <code>identify</code> เพื่อรับ
                        Discord User ID, ชื่อผู้ใช้ (Username/Display Name) และลิงก์รูปโปรไฟล์ (Avatar URL) ไม่มีการขอสิทธิ์เข้าถึงอีเมลหรือข้อความส่วนตัวของคุณ
                    </li>
                    <li>
                        <strong>ข้อมูลการใช้งานฟีเจอร์ภายในเซิร์ฟเวอร์:</strong> คะแนนเลเวลและประวัติ XP, การตั้งค่าการ์ดต้อนรับและรูปพื้นหลังที่อัปโหลด,
                        การตั้งค่ารายงานสภาพอากาศ, รายการสิทธิ์เข้าห้อง (Room Access / Voice Guard), ข้อมูลหัวข้อเก็บเงิน (Fund) และข้อมูลบัตรงาน Jira หรือ
                        GitHub PR เฉพาะเซิร์ฟเวอร์ที่เปิดใช้งาน
                    </li>
                    <li>
                        <strong>บันทึกเหตุการณ์และประวัติความปลอดภัย (Activity & Audit Logs):</strong> เหตุการณ์ในเซิร์ฟเวอร์ตามที่ผู้ดูแลเซิร์ฟเวอร์เปิดบันทึก
                        และประวัติการเข้าสู่ระบบหรือการแก้ไขค่าบน Dashboard (รวมถึง IP Address และ User-Agent เพื่อป้องกันการโจมตีและตรวจสอบความปลอดภัย)
                    </li>
                </ul>
            </SectionBlock>

            <SectionBlock number="02" title="การแยกข้อมูลตามเซิร์ฟเวอร์และการจำกัดสิทธิ์ (Role-Based Isolation)">
                <p>ข้อมูลทุกส่วนในฐานข้อมูลถูกแยกตามรหัสเซิร์ฟเวอร์ (<code>guildId</code>) อย่างชัดเจน และควบคุมการเข้าถึงด้วยระบบ Role-Based Access Control:</p>
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>
                        <strong>เจ้าของเซิร์ฟเวอร์ (Role OWNER):</strong> จะมองเห็นและจัดการได้<strong>เฉพาะเซิร์ฟเวอร์ของตนเอง</strong> (เป็น Server Owner หรือมีสิทธิ์{' '}
                        <code>Manage Server</code> / <code>Administrator</code> ในเซิร์ฟเวอร์นั้น) เท่านั้น ไม่สามารถมองเห็นเซิร์ฟเวอร์อื่นหรือดูรายชื่อห้อง Discord ของผู้อื่นได้
                    </li>
                    <li>
                        <strong>ผู้ใช้ทั่วไป (Role USER):</strong> เห็นเฉพาะเซิร์ฟเวอร์ที่ตนเป็นเจ้าของหรือมีสิทธิ์จัดการในโหมดดูอันดับ (Levels) เท่านั้น ไม่สามารถแก้ไขการตั้งค่าบอทได้
                    </li>
                    <li>
                        <strong>ผู้ดูแลระบบบอท (Role ADMIN):</strong> มีหน้าที่ดูแลความเสถียรของระบบส่วนกลางและจัดการบัญชีผู้ใช้ในกรณีเกิดปัญหาทางเทคนิค
                    </li>
                </ul>
            </SectionBlock>

            <SectionBlock number="03" title="มาตรการรักษาความปลอดภัยของข้อมูล (Data Security)">
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>รหัสผ่านของบัญชี Dashboard (กรณีตั้งรหัสผ่าน) ถูกเข้ารหัสทางเดียวด้วย <code>bcrypt</code></li>
                    <li>ข้อมูลความลับที่เชื่อมต่อบริการภายนอก เช่น Jira API Token ถูกเข้ารหัสด้วย <code>AES-256-GCM</code> ก่อนบันทึกลงฐานข้อมูล และไม่ส่งกลับไปแสดงบนหน้าเว็บอีก</li>
                    <li>GitHub Webhook ตรวจสอบลายเซ็น <code>HMAC-SHA256</code> ทุกครั้งก่อนประมวลผล</li>
                    <li>
                        Session การเข้าสู่ระบบใช้คุกกี้แบบ <code>HttpOnly</code>, <code>Secure</code>, <code>SameSite</code> พร้อมระบบหมุนเวียน Refresh Token
                        และการป้องกัน CSRF ทุกคำสั่งที่แก้ไขข้อมูล
                    </li>
                </ul>
            </SectionBlock>

            <SectionBlock number="04" title="การเชื่อมต่อกับบริการภายนอก (Third-Party Services)">
                <p>เราไม่ขายหรือนำข้อมูลของคุณไปใช้เพื่อการโฆษณา ข้อมูลบางส่วนจะถูกส่งไปยังบริการภายนอกเฉพาะเมื่อคุณเรียกใช้ฟีเจอร์นั้นๆ ได้แก่:</p>
                <ul className="list-disc space-y-1.5 pl-5">
                    <li><strong>Discord API:</strong> สำหรับการทำงานของบอทและการยืนยันตัวตนด้วย Discord OAuth2</li>
                    <li><strong>Google Gemini API:</strong> เฉพาะเมื่อสมาชิกแท็กบอทเพื่อถามคำถาม AI หรือเมื่อเซิร์ฟเวอร์เปิดระบบช่วยตรวจคำหยาบ</li>
                    <li><strong>OpenWeatherMap & RainViewer:</strong> สำหรับดึงข้อมูลสภาพอากาศและเรดาร์ฝนตามพิกัดที่เซิร์ฟเวอร์ตั้งค่า</li>
                    <li><strong>GitHub & Atlassian Jira:</strong> เฉพาะเซิร์ฟเวอร์ที่ผู้ดูแลตั้งค่าเชื่อมต่อด้วยตนเอง</li>
                </ul>
            </SectionBlock>

            <SectionBlock number="05" title="การเก็บรักษาและการขอลบข้อมูล (Data Retention & Deletion)">
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>ข้อมูลเหตุการณ์ในเซิร์ฟเวอร์ (Activity Events) และประวัติ XP จะถูกลบอัตโนมัติเมื่อพ้นระยะเวลาเก็บรักษาที่ระบบกำหนด</li>
                    <li>เมื่อเตะบอทออกจากเซิร์ฟเวอร์ ระบบจะหยุดเก็บข้อมูลใหม่จากเซิร์ฟเวอร์นั้นทันที</li>
                    <li>
                        คุณสามารถยกเลิกการเชื่อมต่อบัญชี Discord หรือออกจากระบบทุกอุปกรณ์ได้ที่หน้า <strong>บัญชีของฉัน (My Account)</strong> และสามารถติดต่อทีมผู้พัฒนาเพื่อขอลบบัญชีหรือข้อมูลของเซิร์ฟเวอร์ออกอย่างถาวรได้ตลอดเวลา
                    </li>
                </ul>
            </SectionBlock>
        </LegalLayout>
    );
}

export function TermsOfServicePage() {
    usePageMeta({
        title: 'ข้อกำหนดการใช้งาน (Terms of Service) — Bot_NotStack',
        description:
            'ข้อกำหนดและเงื่อนไขการใช้งานบอท Discord Bot_NotStack และเว็บ Dashboard สำหรับเจ้าของเซิร์ฟเวอร์และผู้ใช้งาน',
        path: '/terms',
    });

    return (
        <LegalLayout
            active="terms"
            icon={<FileText className="size-3.5" />}
            title="ข้อกำหนดการใช้งาน (Terms of Service)"
            subtitle="การเชิญบอท Bot_NotStack เข้าสู่เซิร์ฟเวอร์ Discord หรือการเข้าใช้งานเว็บ Dashboard ถือว่าคุณยอมรับข้อกำหนดและเงื่อนไขดังต่อไปนี้"
        >
            <SectionBlock number="01" title="การยอมรับข้อกำหนดและกฎของ Discord">
                <p>
                    ผู้ใช้งานและเจ้าของเซิร์ฟเวอร์ที่นำ <strong>Bot_NotStack</strong> ไปใช้งานต้องปฏิบัติตามข้อกำหนดฉบับนี้ รวมถึง{' '}
                    <a
                        href="https://discord.com/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-300 underline underline-offset-4 hover:text-indigo-200"
                    >
                        Discord Terms of Service
                    </a>{' '}
                    และ{' '}
                    <a
                        href="https://discord.com/guidelines"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-300 underline underline-offset-4 hover:text-indigo-200"
                    >
                        Discord Community Guidelines
                    </a>{' '}
                    อย่างเคร่งครัด
                </p>
            </SectionBlock>

            <SectionBlock number="02" title="สิทธิ์และขอบเขตการใช้งาน Dashboard">
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>
                        เจ้าของเซิร์ฟเวอร์หรือผู้ที่มีสิทธิ์ <code>Manage Server</code> / <code>Administrator</code> ใน Discord จะได้รับสิทธิ์ระดับ{' '}
                        <strong>OWNER</strong> เพื่อตั้งค่าบอทเฉพาะในเซิร์ฟเวอร์ของตนเองเท่านั้น
                    </li>
                    <li>
                        คุณต้องรับผิดชอบต่อการตั้งค่าข้อความต้อนรับ ข่าวประกาศ การให้สิทธิ์เข้าห้อง และการเชื่อมต่อ Webhook/API Token ภายในเซิร์ฟเวอร์ของคุณเอง
                    </li>
                    <li>ห้ามพยายามเข้าถึง แก้ไข หรือสอดแนมข้อมูลของเซิร์ฟเวอร์อื่นที่ตนไม่ได้เป็นเจ้าของหรือไม่มีสิทธิ์จัดการ</li>
                </ul>
            </SectionBlock>

            <SectionBlock number="03" title="ข้อห้ามในการใช้งาน (Acceptable Use)">
                <p>ผู้ใช้งานตกลงที่จะไม่กระทำการดังต่อไปนี้:</p>
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>ใช้บอทเพื่อส่งข้อความสแปม คุกคาม เผยแพร่เนื้อหาผิดกฎหมาย หรือละเมิดสิทธิ์ของผู้อื่น</li>
                    <li>ยิงคำขออัตโนมัติ (Bot / Flood / DoS) หรือพยายามเจาะระบบความปลอดภัยของเว็บ Dashboard และ API</li>
                    <li>ใช้ฟีเจอร์ AI Chat หรือระบบประกาศของบอทในทางที่ละเมิดนโยบายการใช้งานของ Discord หรือผู้ให้บริการภายนอก</li>
                </ul>
            </SectionBlock>

            <SectionBlock number="04" title="โควตาและเสถียรภาพของบริการ (Service Availability & Quotas)">
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>
                        Bot_NotStack ให้บริการโดยไม่มีค่าใช้จ่าย และมีการกำหนด Rate Limit รวมถึงโควตาการใช้งาน AI รายวันต่อเซิร์ฟเวอร์เพื่อให้ทุกเซิร์ฟเวอร์ใช้งานร่วมกันได้อย่างเสถียร
                    </li>
                    <li>
                        ระบบอาจมีการปิดปรับปรุงชั่วคราวเพื่ออัปเดตฟีเจอร์หรือแก้ไขข้อผิดพลาด โดยสามารถตรวจสอบสถานะการทำงานสดได้ที่หน้าแรกของเว็บไซต์
                    </li>
                </ul>
            </SectionBlock>

            <SectionBlock number="05" title="การระงับสิทธิ์และการจำกัดความรับผิดชอบ">
                <ul className="list-disc space-y-1.5 pl-5">
                    <li>
                        ทีมผู้พัฒนาขอสงวนสิทธิ์ในการระงับบัญชี Dashboard หรือนำบอทออกจากเซิร์ฟเวอร์ที่ละเมิดข้อกำหนดการใช้งานหรือสร้างภาระผิดปกติต่อระบบโดยไม่ต้องแจ้งให้ทราบล่วงหน้า
                    </li>
                    <li>
                        บริการนี้จัดทำขึ้นตามสภาพ (&ldquo;AS IS&rdquo;) ทีมผู้พัฒนาไม่รับผิดชอบต่อความเสียหายที่เกิดจากการตั้งค่าที่ผิดพลาดของผู้ดูแลเซิร์ฟเวอร์ หรือการหยุดชะงักของบริการภายนอก (เช่น Discord, OpenWeatherMap, GitHub หรือ Jira)
                    </li>
                </ul>
            </SectionBlock>
        </LegalLayout>
    );
}
