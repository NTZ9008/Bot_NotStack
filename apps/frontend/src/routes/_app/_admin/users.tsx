import { passwordFieldSchema, ROLES, usernameFieldSchema, type AdminUser, type UpdateUserInput, type UserRole } from '@notstack/shared';
import { useForm } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { KeyRound, Loader2, LockOpen, LogOut, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { meQuery } from '@/api/auth';
import { usersApi, usersQuery } from '@/api/admin';
import { useConfirm } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage } from '@/lib/api';
import { DEFAULT_AVATAR, formatDateTime } from '@/lib/format';

export const Route = createFileRoute('/_app/_admin/users')({
    loader: ({ context }) => context.queryClient.ensureQueryData(usersQuery),
    component: UsersPage,
});

// ==========================================
// เพิ่มผู้ใช้ (username / password) — ตรวจด้วยกฎเดียวกับ API (@notstack/shared)
// ==========================================
const createUserFormSchema = z.object({
    username: usernameFieldSchema,
    displayName: z.string(),
    password: passwordFieldSchema,
    role: z.enum(ROLES),
});
function CreateUserForm() {
    const queryClient = useQueryClient();
    const form = useForm({
        defaultValues: { username: '', displayName: '', password: '', role: 'USER' as UserRole },
        validators: { onSubmit: createUserFormSchema },
        onSubmit: async ({ value, formApi }) => {
            try {
                await usersApi.create(value);
                toast.success(`เพิ่มผู้ใช้ ${value.username} แล้ว`);
                formApi.reset();
                await queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
            } catch (err) {
                toast.error('เพิ่มผู้ใช้ไม่สำเร็จ', { description: errorMessage(err) });
            }
        },
    });

    return (
        <form
            className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_8rem_auto] md:items-start"
            onSubmit={(e) => {
                e.preventDefault();
                void form.handleSubmit();
            }}
        >
            <form.Field name="username">
                {(field) => (
                    <Field error={field.state.meta.errors[0]?.message}>
                        <Input placeholder="username (a-z 0-9 _ . -)" autoComplete="off" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
                    </Field>
                )}
            </form.Field>
            <form.Field name="displayName">
                {(field) => <Input placeholder="ชื่อที่แสดง (ไม่บังคับ)" autoComplete="off" value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />}
            </form.Field>
            <form.Field name="password">
                {(field) => (
                    <Field error={field.state.meta.errors[0]?.message}>
                        <Input
                            type="password"
                            placeholder="รหัสผ่าน (อย่างน้อย 8 ตัว)"
                            autoComplete="new-password"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                        />
                    </Field>
                )}
            </form.Field>
            <form.Field name="role">
                {(field) => (
                    <Select value={field.state.value} onValueChange={(value) => field.handleChange(value as UserRole)}>
                        <SelectTrigger className="w-full">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="USER">USER</SelectItem>
                            <SelectItem value="ADMIN">ADMIN</SelectItem>
                        </SelectContent>
                    </Select>
                )}
            </form.Field>
            <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                    <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <UserPlus />} เพิ่มผู้ใช้
                    </Button>
                )}
            </form.Subscribe>
        </form>
    );
}

// ==========================================
// ตั้งรหัสผ่านให้ผู้ใช้ (บัญชีจาก Discord ต้องกำหนด username ด้วย)
// ==========================================
function SetPasswordDialog({ user, onClose, onSave }: { user: AdminUser | null; onClose: () => void; onSave: (input: UpdateUserInput) => Promise<void> }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [saving, setSaving] = useState(false);
    const needsUsername = Boolean(user && !user.username);

    const submit = async () => {
        setSaving(true);
        try {
            await onSave({ password, ...(needsUsername ? { username: username.trim() } : {}) });
            setUsername('');
            setPassword('');
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>ตั้งรหัสผ่านให้ {user?.displayName}</DialogTitle>
                    <DialogDescription>ผู้ใช้จะถูกออกจากระบบทุกเครื่อง แล้วต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านนี้</DialogDescription>
                </DialogHeader>
                <form
                    className="space-y-3"
                    onSubmit={(e) => {
                        e.preventDefault();
                        void submit();
                    }}
                >
                    {needsUsername && (
                        <Field label="username" hint="บัญชีนี้มาจาก Discord — ต้องกำหนด username สำหรับเข้าสู่ระบบด้วยรหัสผ่านด้วย">
                            <Input placeholder="username (a-z 0-9 _ . -)" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
                        </Field>
                    )}
                    <Field label="รหัสผ่านใหม่">
                        <Input type="password" placeholder="อย่างน้อย 8 ตัว" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>
                            ยกเลิก
                        </Button>
                        <Button type="submit" disabled={saving || !password}>
                            {saving && <Loader2 className="animate-spin" />} บันทึก
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function UsersPage() {
    const { data, isLoading, error } = useQuery(usersQuery);
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [passwordFor, setPasswordFor] = useState<AdminUser | null>(null);

    const refresh = () => queryClient.invalidateQueries({ queryKey: usersQuery.queryKey });
    const update = useMutation({
        mutationFn: ({ id, input }: { id: number; input: UpdateUserInput }) => usersApi.update(id, input),
        onSettled: refresh,
    });

    const run = async (task: () => Promise<unknown>, success: string, failure: string) => {
        try {
            await task();
            toast.success(success);
        } catch (err) {
            toast.error(failure, { description: errorMessage(err) });
            throw err;
        } finally {
            void refresh();
        }
    };

    const changeRole = async (user: AdminUser, role: UserRole) => {
        const ok = await confirm({
            title: `เปลี่ยน role เป็น ${role}?`,
            description:
                role === 'ADMIN'
                    ? `${user.displayName} จะเข้าถึงทุกเมนู รวมถึงจัดการผู้ใช้และตั้งค่าบอทได้`
                    : `${user.displayName} จะจัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองมีสิทธิ์ Manage Server ใน Discord`,
            confirmText: 'เปลี่ยน role',
            destructive: role === 'ADMIN',
        });
        if (ok) await run(() => update.mutateAsync({ id: user.id, input: { role } }), 'เปลี่ยน role แล้ว', 'เปลี่ยน role ไม่สำเร็จ').catch(() => {});
    };

    const toggleActive = async (user: AdminUser, isActive: boolean) => {
        if (!isActive) {
            const ok = await confirm({
                title: 'ปิดใช้งานบัญชีนี้?',
                description: `${user.displayName} จะถูกออกจากระบบทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดใหม่`,
                confirmText: 'ปิดใช้งาน',
                destructive: true,
            });
            if (!ok) return;
        }
        await run(() => update.mutateAsync({ id: user.id, input: { isActive } }), isActive ? 'เปิดใช้งานบัญชีแล้ว' : 'ปิดใช้งานบัญชีแล้ว', 'ไม่สำเร็จ').catch(() => {});
    };

    const revokeSessions = async (user: AdminUser) => {
        const ok = await confirm({
            title: 'บังคับออกจากระบบทุกเครื่อง?',
            description: user.isSelf ? 'รวมเครื่องนี้ด้วย — คุณจะต้องเข้าสู่ระบบใหม่' : `${user.displayName} จะถูกออกจากระบบทุกอุปกรณ์ทันที`,
            confirmText: 'ออกจากระบบทั้งหมด',
            destructive: true,
        });
        if (!ok) return;
        try {
            const result = await usersApi.revokeSessions(user.id);
            if (user.isSelf) {
                queryClient.setQueryData(meQuery.queryKey, null);
                void navigate({ to: '/login' });
                return;
            }
            toast.success(`ออกจากระบบแล้ว ${result.revoked} session`);
            void refresh();
        } catch (err) {
            toast.error('ไม่สำเร็จ', { description: errorMessage(err) });
        }
    };

    const remove = async (user: AdminUser) => {
        const ok = await confirm({
            title: `ลบผู้ใช้ ${user.displayName}?`,
            description: 'ลบถาวร กู้คืนไม่ได้ (ประวัติใน Audit Logs ยังอยู่) — ถ้าแค่ไม่อยากให้เข้าระบบ แนะนำให้ปิดใช้งานแทน',
            confirmText: 'ลบผู้ใช้',
            destructive: true,
        });
        if (ok) await run(() => usersApi.remove(user.id), 'ลบผู้ใช้แล้ว', 'ลบผู้ใช้ไม่สำเร็จ').catch(() => {});
    };

    const columns: ColumnDef<AdminUser>[] = [
        {
            id: 'user',
            header: 'User',
            cell: ({ row: { original: u } }) => (
                <div className="flex items-center gap-3">
                    <img src={u.avatarUrl ?? DEFAULT_AVATAR} alt="" className="size-9 rounded-full" />
                    <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium">
                            {u.displayName}
                            {u.isSelf && <Badge variant="secondary">คุณ</Badge>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                            #{u.id} · สมัคร {formatDateTime(u.createdAt)}
                        </p>
                    </div>
                </div>
            ),
        },
        {
            id: 'methods',
            header: 'ช่องทาง Login',
            cell: ({ row: { original: u } }) => (
                <div className="flex flex-col items-start gap-1">
                    {u.hasPassword && <Badge variant="outline">🔑 {u.username}</Badge>}
                    {u.discordId && <Badge className="bg-[#5865F2]/20 text-[#c9cdfb]">Discord @{u.discordUsername}</Badge>}
                </div>
            ),
        },
        {
            accessorKey: 'role',
            header: 'Role',
            cell: ({ row: { original: u } }) => (
                <Select value={u.role} disabled={u.isSelf} onValueChange={(role) => void changeRole(u, role as UserRole)}>
                    <SelectTrigger size="sm" className="w-28" title={u.isSelf ? 'เปลี่ยน role ของตัวเองไม่ได้' : undefined}>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="USER">USER</SelectItem>
                        <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectContent>
                </Select>
            ),
        },
        {
            accessorKey: 'isActive',
            header: 'สถานะ',
            cell: ({ row: { original: u } }) => (
                <div className="flex items-center gap-2">
                    <Switch checked={u.isActive} disabled={u.isSelf} onCheckedChange={(checked) => void toggleActive(u, checked)} />
                    {u.lockedUntil && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Badge variant="destructive">ล็อกชั่วคราว</Badge>
                            </TooltipTrigger>
                            <TooltipContent>ล็อกถึง {formatDateTime(u.lockedUntil)}</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            ),
        },
        { accessorKey: 'activeSessions', header: 'Sessions' },
        { accessorKey: 'lastLoginAt', header: 'Login ล่าสุด', cell: ({ row }) => <span className="text-xs">{formatDateTime(row.original.lastLoginAt)}</span> },
        {
            id: 'actions',
            header: 'จัดการ',
            cell: ({ row: { original: u } }) => (
                <div className="flex flex-wrap gap-1">
                    <Button size="xs" variant="outline" onClick={() => setPasswordFor(u)}>
                        <KeyRound /> ตั้งรหัสผ่าน
                    </Button>
                    {u.lockedUntil && (
                        <Button
                            size="xs"
                            variant="outline"
                            onClick={() => void run(() => update.mutateAsync({ id: u.id, input: { unlock: true } }), 'ปลดล็อกบัญชีแล้ว', 'ปลดล็อกไม่สำเร็จ').catch(() => {})}
                        >
                            <LockOpen /> ปลดล็อก
                        </Button>
                    )}
                    <Button size="xs" variant="outline" className="text-amber-300" onClick={() => void revokeSessions(u)}>
                        <LogOut /> เตะออกทุกเครื่อง
                    </Button>
                    {!u.isSelf && (
                        <Button size="xs" variant="destructive" onClick={() => void remove(u)}>
                            <Trash2 /> ลบ
                        </Button>
                    )}
                </div>
            ),
        },
    ];

    return (
        <>
            <PageHeader title="User Management" description="จัดการผู้ใช้ Dashboard — กำหนด role, ปิดบัญชี, รีเซ็ตรหัสผ่าน และบังคับออกจากระบบ" />
            <Card>
                <CardHeader>
                    <CardTitle>เพิ่มผู้ใช้ (username / password)</CardTitle>
                    <CardDescription>
                        คนที่เข้าสู่ระบบด้วย Discord ครั้งแรกจะถูกสร้างบัญชีให้อัตโนมัติด้วย role USER (จัดการได้เฉพาะเซิร์ฟเวอร์ที่ตัวเองมีสิทธิ์ Manage Server) — ADMIN
                        จัดการได้ทุกเซิร์ฟเวอร์ที่บอทอยู่ รวมถึงผู้ใช้และ log ของระบบ
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <CreateUserForm />
                </CardContent>
            </Card>
            <Card>
                <CardContent>
                    {isLoading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState error={error} />
                    ) : (
                        <DataTable columns={columns} data={data ?? []} empty="ยังไม่มีผู้ใช้" rowClassName={(u) => (u.isActive ? undefined : 'opacity-60')} />
                    )}
                </CardContent>
            </Card>
            <SetPasswordDialog
                user={passwordFor}
                onClose={() => setPasswordFor(null)}
                onSave={(input) => run(() => update.mutateAsync({ id: passwordFor!.id, input }), 'ตั้งรหัสผ่านแล้ว', 'ตั้งรหัสผ่านไม่สำเร็จ')}
            />
        </>
    );
}
