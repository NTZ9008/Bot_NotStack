import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { logFileQuery, logFilesQuery } from '@/api/bot';
import { Field } from '@/components/field';
import { PageHeader } from '@/components/page-header';
import { LogContentSkeleton } from '@/components/skeleton/app-pages';
import { ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const Route = createFileRoute('/_app/_admin/logs')({
    loader: ({ context }) => context.queryClient.ensureQueryData(logFilesQuery),
    component: LogsPage,
});

function LogsPage() {
    const [file, setFile] = useState('');
    const files = useQuery(logFilesQuery);
    const content = useQuery(logFileQuery(file));
    const viewer = useRef<HTMLPreElement>(null);

    // เลื่อนไปท้ายไฟล์ (บรรทัดล่าสุด) ทุกครั้งที่โหลดเสร็จ
    useEffect(() => {
        if (viewer.current) viewer.current.scrollTop = viewer.current.scrollHeight;
    }, [content.data]);

    return (
        <>
            <PageHeader help="logs" title="ไฟล์บันทึกของบอท" description="ดูประวัติการทำงานและแจ้งเตือนต่างๆ ของบอท (ข้อความแชท / เข้า-ออกห้องเสียง)" />
            <Card>
                <CardContent className="space-y-4">
                    <div className="flex items-end gap-2">
                        <Field label="เลือกไฟล์บันทึก" className="w-full max-w-sm">
                            <Select value={file} onValueChange={setFile} disabled={!files.data?.length}>
                                <SelectTrigger className="w-full">
                                    <SelectValue
                                        placeholder={files.isLoading ? 'กำลังโหลดไฟล์...' : files.data?.length ? 'เลือกไฟล์บันทึก' : 'ยังไม่มีไฟล์บันทึก'}
                                    />
                                </SelectTrigger>
                                <SelectContent className="max-h-80">
                                    {files.data?.map((name) => (
                                        <SelectItem key={name} value={name}>
                                            {name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </Field>
                        <Button variant="outline" size="icon" aria-label="รีเฟรช" onClick={() => void (file ? content.refetch() : files.refetch())}>
                            <RefreshCw className={content.isFetching || files.isFetching ? 'animate-spin' : undefined} />
                        </Button>
                    </div>
                    {files.error && <ErrorState error={files.error} />}
                    <pre
                        ref={viewer}
                        className="h-[60vh] overflow-auto rounded-lg border bg-black/40 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-300"
                    >
                        {!file ? (
                            <span className="text-muted-foreground">เลือกไฟล์บันทึกด้านบนเพื่อดูเนื้อหา</span>
                        ) : content.isLoading ? (
                            <LogContentSkeleton />
                        ) : content.error ? (
                            <span className="text-destructive">โหลดเนื้อหาไฟล์บันทึกไม่สำเร็จ</span>
                        ) : (
                            content.data || '(ไฟล์ว่าง)'
                        )}
                    </pre>
                </CardContent>
            </Card>
        </>
    );
}
