import { tr } from '../../lib/i18n';
import type { JiraConnectionResult } from '@notstack/shared';
import { ExternalLink, Loader2, PlugZap } from '@/components/icons';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { JiraDraftProps } from './draft';

// 1. เชื่อมต่อ Jira — URL / อีเมล / API token / project key + ปุ่มทดสอบ
export function JiraConnectionCard({
    draft,
    patch,
    apiTokenSet,
    connection,
    testing,
    onTest,
}: Pick<JiraDraftProps, 'draft' | 'patch'> & { apiTokenSet: boolean; connection: JiraConnectionResult | null; testing: boolean; onTest: () => void }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('jira.n1ConnectJira')}</CardTitle>
                <CardDescription>
                    {tr('jira.supportsJiraCloudCardsAreCreated')}{' '}
                    <a
                        className="text-sky-700 dark:text-sky-400 hover:underline"
                        href="https://id.atlassian.com/manage-profile/security/api-tokens"
                        target="_blank"
                        rel="noreferrer"
                    >
                        Atlassian account <ExternalLink className="inline size-3" />
                    </a>
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="Jira site URL" htmlFor="jira-site" hint={tr('jira.eGHttpsYourTeamAtlassian')}>
                    <Input
                        id="jira-site"
                        placeholder="https://your-team.atlassian.net"
                        value={draft.siteUrl}
                        onChange={(e) => patch({ siteUrl: e.target.value })}
                    />
                </Field>
                <Field label={tr('jira.atlassianAccountEmail')} htmlFor="jira-email">
                    <Input id="jira-email" type="email" autoComplete="off" value={draft.email} onChange={(e) => patch({ email: e.target.value })} />
                </Field>
                <Field label="API token" htmlFor="jira-token" hint={apiTokenSet ? tr('jira.alreadySetStoredEncryptedLeaveBlank') : tr('jira.notSet')}>
                    <Input
                        id="jira-token"
                        type="password"
                        autoComplete="new-password"
                        placeholder={apiTokenSet ? '••••••••••••' : tr('jira.pasteApiToken')}
                        value={draft.apiToken}
                        onChange={(e) => patch({ apiToken: e.target.value })}
                    />
                </Field>
                <Field label="Project key" htmlFor="jira-project" hint={tr('jira.thePrefixBeforeTheCardNumber')}>
                    <Input
                        id="jira-project"
                        className="uppercase"
                        placeholder="PROJ"
                        value={draft.projectKey}
                        onChange={(e) => patch({ projectKey: e.target.value.toUpperCase() })}
                    />
                </Field>
                <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" onClick={onTest} disabled={testing}>
                        {testing ? <Loader2 className="animate-spin" /> : <PlugZap />} {tr('jira.testConnection')}
                    </Button>
                    {connection && (
                        <span className="text-sm text-emerald-700 dark:text-emerald-400">
                            ✓ {connection.accountName} · {connection.projectName}
                        </span>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
