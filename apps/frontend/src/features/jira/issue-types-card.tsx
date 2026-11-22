import { tr } from '../../lib/i18n';
import { JIRA_LIMITS, type JiraConnectionResult } from '@notstack/shared';
import { Field } from '@/components/field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { clampInt, type JiraDraftProps } from './draft';

type IssueTypeRow = { id: string; name: string; description: string; missing: boolean };

// 2. ประเภท card ที่ให้สมาชิกเลือก (ดึงจาก Jira ตอนกดทดสอบ) + จำนวนรูปแนบสูงสุด
export function JiraIssueTypesCard({
    draft,
    patchOptions,
    connection,
}: Pick<JiraDraftProps, 'draft' | 'patchOptions'> & { connection: JiraConnectionResult | null }) {
    // ประเภทจาก Jira (หลังกดทดสอบ) + ประเภทที่เลือกไว้แล้วแต่ไม่พบในโปรเจกต์
    const selected = new Map(draft.options.issueTypes.map((type) => [type.id, type]));
    const issueTypeRows: IssueTypeRow[] = [
        ...(connection?.issueTypes ?? []).map((type) => ({ ...type, missing: false })),
        ...draft.options.issueTypes
            .filter((type) => !connection?.issueTypes.some((t) => t.id === type.id))
            .map((type) => ({ id: type.id, name: type.name, description: '', missing: Boolean(connection) })),
    ];
    const toggleType = (row: IssueTypeRow, on: boolean) =>
        patchOptions({
            issueTypes: on
                ? [...draft.options.issueTypes, { id: row.id, name: row.name, emoji: '' }].slice(0, JIRA_LIMITS.maxIssueTypes)
                : draft.options.issueTypes.filter((type) => type.id !== row.id),
        });
    const setEmoji = (id: string, emoji: string) =>
        patchOptions({ issueTypes: draft.options.issueTypes.map((type) => (type.id === id ? { ...type, emoji } : type)) });

    return (
        <Card>
            <CardHeader>
                <CardTitle>{tr('jira.n2CardTypesAndAttachments')}</CardTitle>
                <CardDescription>
                    {tr('jira.pressTestConnectionToLoadTypes')} {JIRA_LIMITS.maxIssueTypes}
                    {tr('jira.youCanPutAnEmojiBefore')}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
                {!issueTypeRows.length && <p className="text-sm text-muted-foreground">{tr('jira.noTypesYetTestTheConnection')}</p>}
                {issueTypeRows.map((row) => {
                    const chosen = selected.get(row.id);
                    return (
                        <div key={row.id} className="flex items-center gap-3 rounded-md border p-2">
                            <Checkbox
                                id={`jira-type-${row.id}`}
                                checked={Boolean(chosen)}
                                disabled={!chosen && draft.options.issueTypes.length >= JIRA_LIMITS.maxIssueTypes}
                                onCheckedChange={(checked) => toggleType(row, checked === true)}
                            />
                            <label htmlFor={`jira-type-${row.id}`} className="min-w-0 flex-1 text-sm">
                                <span className="font-medium">{row.name}</span>
                                {row.missing && <span className="ml-1 text-xs text-destructive">{tr('jira.noLongerInTheProject')}</span>}
                                {row.description && <span className="block truncate text-xs text-muted-foreground">{row.description}</span>}
                            </label>
                            {chosen && (
                                <Input
                                    aria-label={tr('jira.emojiFor', { 0: row.name })}
                                    className="w-20 text-center"
                                    placeholder="emoji"
                                    maxLength={8}
                                    value={chosen.emoji}
                                    onChange={(e) => setEmoji(row.id, e.target.value)}
                                />
                            )}
                        </div>
                    );
                })}
                <Field
                    label={tr('jira.maxImagesPerCard')}
                    htmlFor="jira-max-images"
                    className="mt-2 border-t pt-4"
                    hint={tr('jira.n0NoImageUploadInThe', { 0: JIRA_LIMITS.maxImages, 1: JIRA_LIMITS.maxImageBytes / 1024 / 1024 })}
                >
                    <Input
                        id="jira-max-images"
                        type="number"
                        inputMode="numeric"
                        className="w-28"
                        min={0}
                        max={JIRA_LIMITS.maxImages}
                        value={draft.options.maxImages}
                        onChange={(e) => patchOptions({ maxImages: clampInt(e.target.value, JIRA_LIMITS.maxImages) })}
                    />
                </Field>
            </CardContent>
        </Card>
    );
}
