import { tr, byLang, trText } from '../../lib/i18n';
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

const passwordFormSchema = byLang(() =>
    z
        .object({
            currentPassword: z.string().min(1, tr('account.pleaseEnterYourCurrentPassword')),
            newPassword: passwordFieldSchema,
            confirm: z.string(),
        })
        .refine((value) => value.newPassword === value.confirm, { message: tr('account.theNewPasswordsDontMatch'), path: ['confirm'] }),
);

function PasswordForm() {
    const queryClient = useQueryClient();
    const form = useForm({
        defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
        validators: { onSubmit: passwordFormSchema() },
        onSubmit: async ({ value, formApi }) => {
            try {
                await authApi.changePassword({ currentPassword: value.currentPassword, newPassword: value.newPassword });
                formApi.reset();
                await queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
                toast.success(tr('account.passwordChanged'), { description: tr('account.otherDevicesHaveBeenLoggedOut') });
            } catch (err) {
                toast.error(tr('account.failedToChangePassword'), { description: errorMessage(err) });
            }
        },
    });

    const fields = [
        { name: 'currentPassword', placeholder: tr('account.currentPassword'), autoComplete: 'current-password' },
        { name: 'newPassword', placeholder: tr('account.newPasswordAtLeast8Characters'), autoComplete: 'new-password' },
        { name: 'confirm', placeholder: tr('account.confirmNewPassword'), autoComplete: 'new-password' },
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
                        {isSubmitting ? <Loader2 className="animate-spin" /> : <KeyRound />} {tr('account.changePassword')}
                    </Button>
                )}
            </form.Subscribe>
            <p className="text-xs text-muted-foreground">{tr('account.otherDevicesStillLoggedInWill')}</p>
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
            toast.success(tr('account.discordConnected'), { description: tr('account.youCanNowLogInWith') });
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        } else {
            toast.error(tr('account.failedToConnectDiscord'), {
                description: trText(DISCORD_LINK_ERRORS[search.discord_error ?? '']) ?? tr('common.somethingWentWrong'),
            });
        }
        void navigate({ to: '/account', search: {}, replace: true });
    }, [search.discord, search.discord_error, navigate, queryClient]);

    const unlink = useMutation({
        mutationFn: authApi.unlinkDiscord,
        onSuccess: () => {
            toast.success(tr('account.discordDisconnected'));
            void queryClient.invalidateQueries({ queryKey: meQuery.queryKey });
        },
        onError: (err) => toast.error(tr('common.failed'), { description: errorMessage(err) }),
    });

    const logoutAll = async () => {
        const ok = await confirm({
            title: tr('account.logOutOfEveryDevice2'),
            description: tr('account.everyDeviceLoggedInToThis'),
            confirmText: tr('common.logOutEverywhere'),
            destructive: true,
        });
        if (!ok) return;
        await authApi.logoutAll().catch(() => {});
        replaceSession(queryClient, null);
        void navigate({ to: '/login' });
    };

    return (
        <>
            <PageHeader help="account" title={tr('common.myAccount')} description={tr('account.accountDetailsDiscordConnectionAndSecurity')} />
            <div className="grid gap-6 lg:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>{tr('account.profile')}</CardTitle>
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
                                    {tr('account.joined')} {formatDateTime(user.createdAt)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {tr('account.lastLogin')} {formatDateTime(user.lastLoginAt)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Discord</CardTitle>
                        <CardDescription>
                            {user.discordId ? tr('account.connectedToYouCanLogIn', { 0: user.discordUsername }) : tr('account.linkYourDiscordAccountToManage')}
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
                                            title: tr('account.disconnectDiscord'),
                                            description: tr('account.afterThisYouCanOnlyLog'),
                                            confirmText: tr('account.disconnect'),
                                            cancelText: tr('account.notNow'),
                                            destructive: true,
                                        });
                                        if (ok) unlink.mutate();
                                    }}
                                >
                                    <Unlink /> {tr('account.disconnect')}
                                </Button>
                            ) : (
                                <p className="text-sm text-muted-foreground">{tr('account.thisAccountHasNoPasswordSo')}</p>
                            )
                        ) : discordEnabled ? (
                            <Button asChild className="bg-[#5865F2] text-white hover:bg-[#4752C4]">
                                <a href={apiUrl('/auth/discord/link')}>{tr('common.connectDiscordAccount')}</a>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">{tr('common.theSystemAdminHasntSetUp')}</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{tr('account.password')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {user.hasPassword ? <PasswordForm /> : <p className="text-sm text-muted-foreground">{tr('account.thisAccountLogsInWithDiscord')}</p>}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Sessions</CardTitle>
                        <CardDescription>{tr('account.forgotToLogOutOnAnother')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button variant="destructive" onClick={() => void logoutAll()}>
                            <LogOut /> {tr('account.logOutOfEveryDevice')}
                        </Button>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}
