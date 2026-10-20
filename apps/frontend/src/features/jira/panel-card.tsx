import { JIRA_LIMITS, type JiraOptions } from '@notstack/shared';
import { ColorField } from '@/components/color-field';
import { DiscordMessage } from '@/components/discord-message';
import { Field } from '@/components/field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { JiraDraftProps } from './draft';

// 4. ข้อความแผงพร้อมปุ่ม + ตัวอย่างหน้าตาใน Discord
export function JiraPanelCard({ draft, patchOptions }: Pick<JiraDraftProps, 'draft' | 'patchOptions'>) {
    const panel = draft.options.panel;
    const patchPanel = (next: Partial<JiraOptions['panel']>) => patchOptions({ panel: { ...panel, ...next } });
    return (
        <Card>
            <CardHeader>
                <CardTitle>4. ข้อความแผง</CardTitle>
                <CardDescription>ข้อความพร้อมปุ่มที่บอทส่งเข้าห้องแผง — แก้แล้วบันทึก จากนั้นกด “ส่ง/อัปเดตแผง”</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <Field label="หัวข้อ">
                    <Input maxLength={JIRA_LIMITS.maxPanelTitleLength} value={panel.title} onChange={(e) => patchPanel({ title: e.target.value })} />
                </Field>
                <Field label="รายละเอียด">
                    <Textarea
                        rows={3}
                        maxLength={JIRA_LIMITS.maxPanelDescriptionLength}
                        value={panel.description}
                        onChange={(e) => patchPanel({ description: e.target.value })}
                    />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="ข้อความบนปุ่ม">
                        <Input
                            maxLength={JIRA_LIMITS.maxButtonLabelLength}
                            value={panel.buttonLabel}
                            onChange={(e) => patchPanel({ buttonLabel: e.target.value })}
                        />
                    </Field>
                    <Field label="สีแถบ embed">
                        <ColorField value={panel.color} onChange={(color) => patchPanel({ color })} />
                    </Field>
                </div>
                <DiscordMessage>
                    <div className="max-w-md rounded border-l-4 bg-[#2b2d31] p-3" style={{ borderColor: panel.color }}>
                        {panel.title && <div className="font-semibold text-white">{panel.title}</div>}
                        {panel.description && <div className="mt-1 text-sm whitespace-pre-wrap">{panel.description}</div>}
                    </div>
                    <span className="mt-2 inline-flex items-center gap-1.5 rounded bg-[#5865f2] px-4 py-1.5 text-sm font-medium text-white">
                        🎫 {panel.buttonLabel || 'เปิด Jira card'}
                    </span>
                </DiscordMessage>
            </CardContent>
        </Card>
    );
}
