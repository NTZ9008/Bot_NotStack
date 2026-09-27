import { DISCORD_LINK_ERRORS, passwordFieldSchema } from '@notstack/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { KeyRound, Loader2, LogOut, Unlink } from 'lucide-react';
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

const searchSchema = z.object({
    discord: z.string().optional(),
    discord_error: z.string().optional(),
});

export const Route = createFileRoute('/_app/account')({
    validateSearch: searchSchema,
    component: AccountPage,
});

const passwordFormSchema = z
    .object({
        currentPassword: z.string().min(1, 'กรุณากรอกรหัสผ่านปัจจุบัน'),
        newPassword: passwordFieldSchema,
        confirm: z.string(),
    })
    .refine((value) => value.newPassword === value.confirm, { message: 'รหัสผ่านใหม่ไม่ตรงกัน', path: ['confirm'] });


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
                toast.success('เปลี่ยนรหัสผ่านแล้ว', { description: 'อุปกรณ์อื่นถูกออกจากระบบเรียบร้อย' });
            } catch (err) {
                toast.error('เปลี่ยนรหัสผ่านไม่สำเร็จ', { description: errorMessage(err) });
            }
        },
    });

    const fields = [
        { name: 'currentPassword', placeholder: 'รหัสผ่านปัจจุบัน', autoComplete: 'current-password' },
        { name: 'newPassword', placeholder: 'รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)', autoComplete: 'new-password' },
        { name: 'confirm', placeholder: 'ยืนยันรหัสผ่านใหม่', autoComplete: 'new-password' },
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
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} เปลี่ยนรหัสผ่าน
                    </Button>
                )}
            </form.Subscribe>
            <p className="text-xs text-muted-foreground">อุปกรณ์อื่นที่เข้าสู่ระบบค้างไว้จะถูกออกจากระบบทันที</p>
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
            toast.success('เชื่อมต่อ Discord สำเร็จ', { description: 'ต่อไปเข้าสู่ระบบด้วย Discord ได้เลย' });
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        } else {
            toast.error('เชื่อมต่อ Discord ไม่สำเร็จ', { description: DISCORD_LINK_ERRORS[search.discord_error ?? ''] ?? 'เกิดข้อผิดพลาด' });
        }
        void navigate({ to: '/account', search: {}, replace: true });
    }, [search.discord, search.discord_error, navigate, queryClient]);

    const unlink = useMutation({
        mutationFn: authApi.unlinkDiscord,
        onSuccess: () => {
            toast.success('ยกเลิกการเชื่อมต่อ Discord แล้ว');
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        },
        onError: (err) => toast.error('ไม่สำเร็จ', { description: errorMessage(err) }),
    });

    const logoutAll = async () => {
        const ok = await confirm({
            title: 'ออกจากระบบทุกอุปกรณ์?',
            description: 'ทุกเครื่องที่เข้าสู่ระบบบัญชีนี้อยู่ (รวมเครื่องนี้) จะต้องเข้าสู่ระบบใหม่',
            confirmText: 'ออกจากระบบทั้งหมด',
            destructive: true,
        });
        if (!ok) return;
        await authApi.logoutAll().catch(() => {});
        queryClient.setQueryData(meQuery.queryKey, null);
        void navigate({ to: '/login' });
    };

    return (
        <>
            <PageHeader title="My Account" description="ข้อมูลบัญชี การเชื่อมต่อ Discord และความปลอดภัย" />
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>โปรไฟล์</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-4">
                            <img src={user.avatarUrl ?? DEFAULT_AVATAR} alt="" className="size-16 rounded-full border border-white/10" />
                            <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate text-lg font-semibold">{user.displayName}</p>
                                    <RoleBadge role={user.role} />
                                </div>
                                <p className="text-sm text-muted-foreground">username: {user.username ?? '—'}</p>
                                <p className="text-xs text-muted-foreground">สมัครเมื่อ {formatDateTime(user.createdAt)}</p>
                                <p className="text-xs text-muted-foreground">เข้าสู่ระบบล่าสุด {formatDateTime(user.lastLoginAt)}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Discord</CardTitle>
                        <CardDescription>
                            {user.discordId
                                ? `เชื่อมต่อกับ @${user.discordUsername} แล้ว — เข้าสู่ระบบด้วยปุ่ม Discord ได้`
                                : 'ผูกบัญชี Discord เพื่อจัดการเซิร์ฟเวอร์ที่คุณมีสิทธิ์ Manage Server และเข้าสู่ระบบด้วยปุ่ม Discord ได้โดยไม่ต้องพิมพ์รหัสผ่าน'}
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
                                            title: 'ยกเลิกการเชื่อมต่อ Discord?',
                                            description: 'หลังจากนี้ต้องเข้าสู่ระบบด้วย username/รหัสผ่านเท่านั้น',
                                            confirmText: 'ยกเลิกการเชื่อมต่อ',
                                            cancelText: 'ไม่ใช่ตอนนี้',
                                            destructive: true,
                                        });
                                        if (ok) unlink.mutate();
                                    }}
                                >
                                    <Unlink /> ยกเลิกการเชื่อมต่อ
                                </Button>
                            ) : (
                                <p className="text-sm text-muted-foreground">บัญชีนี้ไม่มีรหัสผ่าน จึงยกเลิกการเชื่อมต่อไม่ได้ (จะไม่เหลือช่องทางเข้าสู่ระบบ)</p>
                            )
                        ) : discordEnabled ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={apiUrl('/auth/discord/link')}>เชื่อมต่อบัญชี Discord</a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">ผู้ดูแลระบบยังไม่ได้ตั้งค่า Discord OAuth</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>รหัสผ่าน</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {user.hasPassword ? (
                            <PasswordForm />
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                บัญชีนี้เข้าสู่ระบบด้วย Discord เท่านั้น — ถ้าต้องการใช้รหัสผ่าน ให้ผู้ดูแลระบบตั้ง username/รหัสผ่านให้ในหน้า Users
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sessions</CardTitle>
                        <CardDescription>ลืมออกจากระบบที่เครื่องอื่น หรือสงสัยว่ามีคนแอบใช้บัญชี? ออกจากระบบทุกอุปกรณ์ได้ที่นี่ (รวมเครื่องนี้)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="destructive" onClick={() => void logoutAll()}>
                            <LogOut /> ออกจากระบบทุกอุปกรณ์
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
