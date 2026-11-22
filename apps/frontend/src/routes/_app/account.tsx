import { tr } from '../../lib/i18n';
import { stringSearch } from '@/lib/search-params';
import { replaceSession } from '@/lib/session';
import { DISCORD_LINK_ERRORS, passwordFieldSchema } from '@notstack/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { KeyRound, Loader2, LogOut, Unlink } from '@/components/icons';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { authApi, meQuery } from '@/api/auth';
import { useConfirm } from '@/components/confirm-dialog';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { RoleBadge } from '@/components/role-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/use-auth';
import { apiUrl, errorMessage } from '@/lib/api';
import { DEFAULT_AVATAR, formatDateTime } from '@/lib/format';

export const Route = createFileRoute('/_app/account')({
    validateSearch: (search: Record<string, unknown>) => stringSearch(search, ['discord', 'discord_error']),
    component: AccountPage,
});

const passwordFormSchema = z
    .object({
        currentPassword: z.string().min(1, tr('กรุณากรอกรหัสผ่านปัจจุบัน')),
        newPassword: passwordFieldSchema,
        confirm: z.string(),
    })
    .refine((value) => value.newPassword === value.confirm, { message: tr('รหัสผ่านใหม่ไม่ตรงกัน'), path: ['confirm'] });

function PasswordForm() {
    const queryClient = useQueryClient();
    const form = useForm({
        defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
        validators: { onSubmit: passwordFormSchema },
        onSubmit: async ({ value, formApi }) => {
            try {
                await authApi.changePassword({ currentPassword: value.currentPassword, newPassword: value.newPassword });
                formApi.reset();
                await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
                toast.success(tr('เปลี่ยนรหัสผ่านแล้ว'), { description: tr('อุปกรณ์อื่นถูกออกจากระบบเรียบร้อย') });
            } catch (err) {
                toast.error(tr('เปลี่ยนรหัสผ่านไม่สำเร็จ'), { description: errorMessage(err) });
            }
        },
    });

    const fields = [
        { name: 'currentPassword', placeholder: tr('รหัสผ่านปัจจุบัน'), autoComplete: 'current-password' },
        { name: 'newPassword', placeholder: tr('รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)'), autoComplete: 'new-password' },
        { name: 'confirm', placeholder: tr('ยืนยันรหัสผ่านใหม่'), autoComplete: 'new-password' },
    ] as const;

    return (
        <form
            className="space-y-3"
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            {fields.map((config) => (
                <form.Field key={config.name} name={config.name}>
                    {(field) => (
                        <Field error={field.state.meta.errors[0]?.message}>
                            <Input
                                type="password"
                                placeholder={config.placeholder}
                                autoComplete={config.autoComplete}
                                value={field.state.value}
                                onBlur={field.handleBlur}
                                onChange={(e) => field.handleChange(e.target.value)}
                            />
                        </Field>
                    )}
                </form.Field>
            ))}
            <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} {tr('เปลี่ยนรหัสผ่าน')}
                    </Button>
                )}
            </form.Subscribe>
            <p className="text-xs text-muted-foreground">{tr('อุปกรณ์อื่นที่เข้าสู่ระบบค้างไว้จะถูกออกจากระบบทันที')}</p>
        </form>
    );
}

function AccountPage() {
    const { user, discordEnabled } = useAuth();
    const search = Route.useSearch();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const queryClient = useQueryClient();

    // ผลการผูก Discord ที่ API ส่งกลับมา (/account?discord=linked หรือ ?discord_error=...)
    useEffect(() => {
        if (!search.discord && !search.discord_error) return;
        if (search.discord === 'linked') {
            toast.success(tr('เชื่อมต่อ Discord สำเร็จ'), { description: tr('ต่อไปเข้าสู่ระบบด้วย Discord ได้เลย') });
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        } else {
            toast.error(tr('เชื่อมต่อ Discord ไม่สำเร็จ'), { description: tr(DISCORD_LINK_ERRORS[search.discord_error ?? '']) ?? tr('เกิดข้อผิดพลาด') });
        }
        void navigate({ to: '/account', search: {}, replace: true });
    }, [search.discord, search.discord_error, navigate, queryClient]);

    const unlink = useMutation({
        mutationFn: authApi.unlinkDiscord,
        onSuccess: () => {
            toast.success(tr('ยกเลิกการเชื่อมต่อ Discord แล้ว'));
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        },
        onError: (err) => toast.error(tr('ไม่สำเร็จ'), { description: errorMessage(err) }),
    });

    const logoutAll = async () => {
        const ok = await confirm({
            title: tr('ออกจากระบบทุกอุปกรณ์?'),
            description: tr('ทุกเครื่องที่เข้าสู่ระบบบัญชีนี้อยู่ (รวมเครื่องนี้) จะต้องเข้าสู่ระบบใหม่'),
            confirmText: tr('ออกจากระบบทั้งหมด'),
            destructive: true,
        });
        if (!ok) return;
        await authApi.logoutAll().catch(() => {});
        replaceSession(queryClient, null);
        void navigate({ to: '/login' });
    };

    return (
        <>
            <PageHeader help="account" title={tr('บัญชีของฉัน')} description={tr('ข้อมูลบัญชี การเชื่อมต่อ Discord และความปลอดภัย')} />
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('โปรไฟล์')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <img src={user.avatarUrl ?? DEFAULT_AVATAR} alt="" className="size-16 rounded-full border border-border" />
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-lg font-semibold">{user.displayName}</p>
                                    <RoleBadge role={user.role} />
                                </div>
                                <p className="text-sm text-muted-foreground">username: {user.username ?? '—'}</p>
                                <p className="text-xs text-muted-foreground">
                                    {tr('สมัครเมื่อ')} {formatDateTime(user.createdAt)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {tr('เข้าสู่ระบบล่าสุด')} {formatDateTime(user.lastLoginAt)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Discord</CardTitle>
                        <CardDescription>
                            {user.discordId
                                ? tr('เชื่อมต่อกับ @{0} แล้ว — เข้าสู่ระบบด้วยปุ่ม Discord ได้', { 0: user.discordUsername })
                                : tr(
                                      'ผูกบัญชี Discord เพื่อจัดการเซิร์ฟเวอร์ที่คุณมีสิทธิ์ Manage Server และเข้าสู่ระบบด้วยปุ่ม Discord ได้โดยไม่ต้องพิมพ์รหัสผ่าน',
                                  )}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {user.discordId ? (
                            user.hasPassword ? (
                                <Button
                                    variant="destructive"
                                    disabled={unlink.isPending}
                                    onClick={async () => {
                                        const ok = await confirm({
                                            title: tr('ยกเลิกการเชื่อมต่อ Discord?'),
                                            description: tr('หลังจากนี้ต้องเข้าสู่ระบบด้วย username/รหัสผ่านเท่านั้น'),
                                            confirmText: tr('ยกเลิกการเชื่อมต่อ'),
                                            cancelText: tr('ไม่ใช่ตอนนี้'),
                                            destructive: true,
                                        });
                                        if (ok) unlink.mutate();
                                    }}
                                >
                                    <Unlink /> {tr('ยกเลิกการเชื่อมต่อ')}
                                </Button>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    {tr('บัญชีนี้ไม่มีรหัสผ่าน จึงยกเลิกการเชื่อมต่อไม่ได้ (จะไม่เหลือช่องทางเข้าสู่ระบบ)')}
                                </p>
                            )
                        ) : discordEnabled ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={apiUrl('/auth/discord/link')}>{tr('เชื่อมต่อบัญชี Discord')}</a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">{tr('ผู้ดูแลระบบยังไม่ได้ตั้งค่า Discord OAuth')}</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{tr('รหัสผ่าน')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {user.hasPassword ? (
                            <PasswordForm />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                {tr('บัญชีนี้เข้าสู่ระบบด้วย Discord เท่านั้น — ถ้าต้องการใช้รหัสผ่าน ให้ผู้ดูแลระบบตั้ง username/รหัสผ่านให้ในหน้า Users')}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sessions</CardTitle>
                        <CardDescription>
                            {tr('ลืมออกจากระบบที่เครื่องอื่น หรือสงสัยว่ามีคนแอบใช้บัญชี? ออกจากระบบทุกอุปกรณ์ได้ที่นี่ (รวมเครื่องนี้)')}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="destructive" onClick={() => void logoutAll()}>
                            <LogOut /> {tr('ออกจากระบบทุกอุปกรณ์')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
