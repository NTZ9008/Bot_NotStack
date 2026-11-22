import { tr } from '../../lib/i18n';
import { JIRA_LIMITS, type GuildChannel, type GuildRole } from '@notstack/shared';
import { ChannelSelect } from '@/components/channel-select';
import { Field } from '@/components/field';
import { IdChoices } from '@/components/id-choices';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { clampInt, type JiraDraftProps } from './draft';

// 3. ห้องแผง / ห้อง log / หมวดหมู่ของห้องส่วนตัว / ปิดห้องอัตโนมัติ / ยศทีมงาน
export function JiraRoomsCard({
    draft,
    patch,
    patchOptions,
    textChannels,
    categories,
    roles,
}: JiraDraftProps & { textChannels: GuildChannel[]; categories: GuildChannel[]; roles: GuildRole[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('jira.n3ChannelsAndPermissions')}</CardTitle>
                <CardDescription>{tr('jira.privateChannelsAreVisibleOnlyTo')}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label={tr('jira.panelChannel')} hint={tr('jira.channelWithTheOpenJiraCard')}>
                    <ChannelSelect channels={textChannels} value={draft.panelChannelId} onChange={(panelChannelId) => patch({ panelChannelId })} />
                </Field>
                <Field label={tr('jira.logChannel')} hint={tr('jira.announcesWhoOpenedWhichCardWith')}>
                    <ChannelSelect
                        channels={textChannels}
                        value={draft.logChannelId}
                        onChange={(logChannelId) => patch({ logChannelId })}
                        noneLabel={tr('jira.noLog')}
                    />
                </Field>
                <Field label={tr('jira.privateChannelCategory')} hint={tr('jira.privateChannelsAreCreatedInThis')}>
                    <ChannelSelect
                        channels={categories}
                        showCategories
                        value={draft.categoryId}
                        onChange={(categoryId) => patch({ categoryId })}
                        noneLabel={tr('jira.noCategory')}
                    />
                </Field>
                <Field
                    label={tr('jira.autoCloseChannelAfterCreatingA')}
                    htmlFor="jira-auto-close"
                    hint={tr('jira.n0NeverTheOpenerStaffClose', {
                        0: JIRA_LIMITS.maxAutoCloseSeconds,
                    })}
                >
                    <Input
                        id="jira-auto-close"
                        type="number"
                        inputMode="numeric"
                        className="w-28"
                        min={0}
                        max={JIRA_LIMITS.maxAutoCloseSeconds}
                        value={draft.options.autoCloseSeconds}
                        onChange={(e) => patchOptions({ autoCloseSeconds: clampInt(e.target.value, JIRA_LIMITS.maxAutoCloseSeconds) })}
                    />
                </Field>
                <IdChoices
                    title={tr('jira.staffRolesThatSeeEveryChannel')}
                    options={roles}
                    values={draft.options.staffRoleIds}
                    onChange={(staffRoleIds) => patchOptions({ staffRoleIds: staffRoleIds.slice(0, JIRA_LIMITS.maxStaffRoles) })}
                    emptyHint={tr('jira.noneOnlyTheOpenerAndAdministrators')}
                />
            </CardContent>
        </Card>
    );
}
