import { replaceSession } from '@/lib/session';
import { LOGIN_ERRORS, loginSchema, type MeResponse } from '@notstack/shared';
import { useForm } from '@tanstack/react-form';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { authApi, meQuery, providersQuery } from '@/api/auth';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { DiscordIcon } from '@/components/discord-icon';
import { apiUrl, errorMessage } from '@/lib/api';
import { ConnectingScreen } from '@/components/states';

const searchSchema = z.object({
    error: z.string().optional(),
    redirect: z.string().optional(),
});

export const Route = createFileRoute('/login')({
    validateSearch: searchSchema,
    // มี session ค้างอยู่ (เช่นเปิดลิงก์จากที่อื่นแล้ว access token หมดอายุ) → ต่ออายุแล้วเข้า Dashboard เลย
    beforeLoad: async ({ context }) => {
        const me = await context.queryClient.ensureQueryData(meQuery);
        if (me) throw redirect({ to: '/' });
    },
    component: LoginPage,
    pendingComponent: ConnectingScreen,
});

function LoginPage() {
    const search = Route.useSearch();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { data: providers } = useQuery(providersQuery);
    const { data: info } = useQuery(appInfoQuery);

    // ข้อความ error ที่ส่งกลับมาจาก Discord OAuth (/login?error=...)
    useEffect(() => {
        if (!search.error) return;
        toast.error('เข้าสู่ระบบไม่สำเร็จ', { description: LOGIN_ERRORS[search.error] ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง' });
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
                toast.success('เข้าสู่ระบบสำเร็จ!');
                await navigate({ to: search.redirect?.startsWith('/') ? search.redirect : '/' });
            } catch (err) {
                toast.error('เข้าสู่ระบบล้มเหลว', { description: errorMessage(err) });
            }
        },
    });

    return (
        <div className="flex min-h-svh items-center justify-center p-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="flex justify-center">
                    <img
                        src={info?.bot?.avatar ?? DEFAULT_BOT.avatar}
                        alt="Bot Logo"
                        className="size-18 rounded-full border-2 border-white/10 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                    />
                </div>
                <Card>
                    <CardHeader className="text-center">
                        <CardTitle className="text-xl">BotNotStack Dashboard</CardTitle>
                        <CardDescription>เข้าสู่ระบบเพื่อจัดการบอท</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                        <form
                            className="space-y-4"
                            onSubmit={(e) => {
                                e.preventDefault();
                                void form.handleSubmit();
                            }}
                        >
                            <form.Field name="username">
                                {(field) => (
                                    <Field label="Username" htmlFor={field.name} error={field.state.meta.errors[0]?.message}>
                                        <Input
                                            id={field.name}
                                            autoComplete="username"
                                            autoFocus
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Field name="password">
                                {(field) => (
                                    <Field label="Password" htmlFor={field.name} error={field.state.meta.errors[0]?.message}>
                                        <Input
                                            id={field.name}
                                            type="password"
                                            autoComplete="current-password"
                                            value={field.state.value}
                                            onBlur={field.handleBlur}
                                            onChange={(e) => field.handleChange(e.target.value)}
                                        />
                                    </Field>
                                )}
                            </form.Field>
                            <form.Subscribe selector={(state) => state.isSubmitting}>
                                {(isSubmitting) => (
                                    <Button type="submit" className="h-10 w-full" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="animate-spin" />}
                                        Login
                                    </Button>
                                )}
                            </form.Subscribe>
                        </form>

                        {providers?.discord && (
                            <>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                                    หรือ
                                </div>
                                <Button asChild className="h-10 w-full bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                    {/* ลิงก์ธรรมดา (ไม่ใช่ SPA) เพราะต้องออกไปหน้า Discord แล้วกลับมาที่ callback ของ API */}
                                    <a href={apiUrl('/auth/discord')}>
                                        <DiscordIcon />
                                        เข้าสู่ระบบด้วย Discord
                                    </a>
                                </Button>
                            </>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
