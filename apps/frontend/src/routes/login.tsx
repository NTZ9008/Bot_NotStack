import { tr, trText } from '../lib/i18n';
import { Spinner } from '@/components/ui/spinner';
import { stringSearch } from '@/lib/search-params';
import { replaceSession } from '@/lib/session';
import { LOGIN_ERRORS, loginSchema, type MeResponse } from '@notstack/shared';
import { useForm } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { ArrowLeft } from '@/components/icons';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { authApi, meQuery, providersQuery } from '@/api/auth';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DiscordIcon } from '@/components/discord-icon';
import { usePageMeta } from '@/hooks/use-page-meta';
import { apiUrl, errorMessage } from '@/lib/api';
import { SplashScreen } from '@/components/splash-screen';
import { LanguageToggle } from '@/features/landing/language-toggle';
import '@/features/landing/landing.css';
import headWhite from '@/features/landing/mascot/head-white.webp';
import mascotLaptop from '@/features/landing/mascot/laptop.webp';

export const Route = createFileRoute('/login')({
    validateSearch: (search: Record<string, unknown>) => stringSearch(search, ['error', 'redirect']),
    // มี session ค้างอยู่ (เช่นเปิดลิงก์จากที่อื่นแล้ว access token หมดอายุ) → ต่ออายุแล้วเข้า Dashboard เลย
    beforeLoad: async ({ context }) => {
        // เริ่มโหลดช่องทาง login ไปพร้อมกัน ปุ่ม Discord จะได้ขึ้นเร็ว (ไม่สำเร็จ useQuery ในหน้าจะลองใหม่เอง)
        void context.queryClient.prefetchQuery(providersQuery);
        const me = await context.queryClient.ensureQueryData(meQuery);
        if (me) throw redirect({ to: '/dashboard' });
    },
    component: LoginPage,
    // splash ต่อจากใน index.html ทันที (ไม่รอ pendingMs) จะได้ไม่มีจังหวะจอว่าง
    pendingComponent: () => <SplashScreen />,
    pendingMs: 0,
});

function LoginPage() {
    const search = Route.useSearch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: providers } = useQuery(providersQuery);
    const { data: info } = useQuery(appInfoQuery);
    usePageMeta('/login');

    // ข้อความ error ที่ส่งกลับมาจาก Discord OAuth (/login?error=...)
    useEffect(() => {
        if (!search.error) return;
        toast.error(tr('login.loginFailed'), { description: trText(LOGIN_ERRORS[search.error]) ?? tr('login.somethingWentWrongPleaseTryAgain') });
        void navigate({ to: '/login', search: {}, replace: true });
    }, [search.error, navigate]);

    const form = useForm({
        defaultValues: { username: '', password: '' },
        validators: { onSubmit: loginSchema },
        onSubmit: async ({ value }) => {
            try {
                const result = await authApi.login(value);
                const me: MeResponse = { user: result.user, discordEnabled: Boolean(providers?.discord) };
                replaceSession(queryClient, me);
                await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
                toast.success(tr('login.loggedIn'));
                await navigate({ to: search.redirect?.startsWith('/') ? search.redirect : '/dashboard' });
            } catch (err) {
                toast.error(tr('login.loginFailed2'), { description: errorMessage(err) });
            }
        },
    });

    const botName = info?.bot?.name ?? DEFAULT_BOT.name;

    return (
        <div className="landing dark landing-grain relative isolate flex min-h-svh flex-col overflow-hidden bg-[var(--ld-bg)] text-foreground">
            {/* ฉากเดียวกับ hero หน้า landing: ไฟส่อง + พื้นเวทีเส้นตาราง + ตัวหนังสือลายน้ำ */}
            <div aria-hidden className="landing-stage-light absolute inset-0 -z-10" />
            <div aria-hidden className="landing-stage-floor absolute -inset-x-1/2 bottom-0 -z-10 h-[40%]" />
            <p
                aria-hidden
                className="landing-watermark absolute inset-x-0 top-[14%] -z-10 text-center text-[clamp(5rem,19vw,17rem)] leading-none font-black tracking-[-0.06em] whitespace-nowrap uppercase select-none"
            >
                Login
            </p>

            <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-3 pt-3 sm:px-6">
                <Link to="/" viewTransition className="landing-brand group flex min-w-0 items-center gap-2.5 rounded-xl pr-2">
                    <span className="grid size-11 shrink-0 place-items-end overflow-hidden rounded-xl bg-gradient-to-br from-[#3a55ff] to-[#1c2fd6] ring-1 ring-white/20">
                        <img
                            src={headWhite}
                            alt=""
                            className="size-11 translate-y-1 transition-transform duration-300 group-hover:translate-y-0 group-hover:scale-110"
                        />
                    </span>
                    <span className="min-w-0 leading-none">
                        <span className="block truncate text-[15px] font-black tracking-tight">{botName}</span>
                        <span className="mt-1 block font-mono text-[10px] tracking-[0.25em] text-[var(--ld-blue-ink)] uppercase">Discord bot</span>
                    </span>
                </Link>
                <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <LanguageToggle />
                    <Link
                        to="/"
                        viewTransition
                        className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/20 px-4 text-sm font-semibold transition-colors hover:border-white hover:bg-white hover:text-slate-950"
                    >
                        <ArrowLeft className="size-4" aria-hidden="true" />
                        <span className="hidden sm:inline">{tr('login.backToHome')}</span>
                        <span className="sr-only sm:hidden">{tr('login.backToHome')}</span>
                    </Link>
                </div>
            </header>

            <main className="mx-auto grid w-full max-w-5xl flex-1 content-center items-center gap-8 px-4 py-10 lg:grid-cols-[1fr_26rem] lg:gap-14">
                {/* มาสคอตถือโน้ตบุ๊ก (ท่าเดียวกับขั้น Login ในหน้า landing) + กล่องคำพูด */}
                <div className="flex items-end gap-3 sm:gap-6">
                    <img
                        src={mascotLaptop}
                        alt=""
                        aria-hidden
                        draggable={false}
                        className="landing-mascot landing-mascot-bob h-36 w-auto shrink-0 sm:h-48 lg:h-80"
                    />
                    <div className="min-w-0 pb-3">
                        <p className="landing-bubble relative inline-block max-w-xs rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-xl shadow-black/30 sm:text-base">
                            {tr('login.mascotSay')}
                        </p>
                        <p className="mt-5 font-mono text-xs tracking-[0.3em] text-[var(--ld-blue-ink)] uppercase">Dashboard</p>
                        <h1 className="mt-1.5 text-[clamp(1.9rem,4.5vw,3.25rem)] leading-tight font-black tracking-tight">
                            {botName} <span className="text-[var(--ld-blue-ink)]">Dashboard</span>
                        </h1>
                        <p className="mt-2 max-w-sm text-pretty text-slate-300">{tr('login.logInToManageTheBot')}</p>
                    </div>
                </div>

                <div className="landing-login-card relative isolate mt-10 lg:mt-0">
                    {/* วงคลื่นรอบการ์ด (ชุดเดียวกับรอบมาสคอตใน hero) + แสงเรือง */}
                    <div aria-hidden className="landing-stage-rings absolute top-1/2 left-1/2 -z-10 aspect-square w-[150%] -translate-x-1/2 -translate-y-1/2" />
                    <div aria-hidden className="absolute -inset-6 -z-10 rounded-full bg-[var(--ld-blue)]/25 blur-3xl" />
                    {/* การ์ดหัวโดม (โค้งแบบเดียวกับ footer ของ landing) */}
                    <div className="relative rounded-[50%_50%_2.5rem_2.5rem/6rem_6rem_2.5rem_2.5rem] border border-white/12 bg-[var(--ld-card)]/85 px-6 pt-14 pb-7 shadow-2xl shadow-black/50 backdrop-blur-xl sm:px-9">
                        <span className="absolute top-0 left-1/2 grid size-20 -translate-x-1/2 -translate-y-1/2 place-items-end overflow-hidden rounded-full bg-gradient-to-br from-[#3a55ff] to-[#1c2fd6] shadow-xl shadow-[#2a45ff]/40 ring-4 ring-[var(--ld-bg)]">
                            <img src={headWhite} alt="" className="size-20 translate-y-1.5" />
                        </span>
                        <h2 className="text-center text-2xl font-black tracking-tight">Login</h2>
                        <form
                            className="mt-5 space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void form.handleSubmit();
                            }}
                        >
                            <form.Field name="username">
                                {(field) => (
                                    <Field className="[&>label]:pl-5" label="Username" htmlFor={field.name} error={field.state.meta.errors[0]?.message}>
                                        <Input
                                            id={field.name}
                                            autoComplete="username"
                                            autoFocus
                                            className="h-12 rounded-full border-white/12 bg-white/[0.04] px-5"
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name="password">
                                {(field) => (
                                    <Field className="[&>label]:pl-5" label="Password" htmlFor={field.name} error={field.state.meta.errors[0]?.message}>
                                        <Input
                                            id={field.name}
                                            type="password"
                                            autoComplete="current-password"
                                            className="h-12 rounded-full border-white/12 bg-white/[0.04] px-5"
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Subscribe selector={(state) => state.isSubmitting}>
                                {(isSubmitting) => (
                                    <Button
                                        type="submit"
                                        className="h-12 w-full rounded-full bg-[var(--ld-blue)] font-semibold text-white shadow-lg shadow-[#2a45ff]/40 hover:bg-[#3d56ff] active:scale-[0.98]"
                                        disabled={isSubmitting}
                                    >
                                        {isSubmitting && <Spinner />}
                                        Login
                                    </Button>
                                )}
                            </form.Subscribe>
                        </form>

                        {providers?.discord && (
                            <>
                                <div className="my-5 flex items-center gap-3 text-xs text-slate-400 before:h-px before:flex-1 before:bg-white/12 after:h-px after:flex-1 after:bg-white/12">
                                    {tr('login.or')}
                                </div>
                                <Button
                                    asChild
                                    className="h-12 w-full rounded-full bg-[#5865F2] font-semibold text-white hover:bg-[#4752C4] active:scale-[0.98]"
                                >
                                    {/* ลิงก์ธรรมดา (ไม่ใช่ SPA) เพราะต้องออกไปหน้า Discord แล้วกลับมาที่ callback ของ API */}
                                    <a href={apiUrl('/auth/discord')}>
                                        <DiscordIcon />
                                        {tr('login.logInWithDiscord')}
                                    </a>
                                </Button>
                            </>
                        )}

                        <p className="mt-6 text-center text-xs text-slate-400">
                            {tr('login.byLoggingInYouAcceptThe')}{' '}
                            <Link to="/terms" className="text-[var(--ld-blue-ink)] underline underline-offset-4 hover:text-white">
                                {tr('login.termsOfService')}
                            </Link>{' '}
                            {tr('common.and')}{' '}
                            <Link to="/privacy" className="text-[var(--ld-blue-ink)] underline underline-offset-4 hover:text-white">
                                {tr('login.privacyPolicy')}
                            </Link>
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
