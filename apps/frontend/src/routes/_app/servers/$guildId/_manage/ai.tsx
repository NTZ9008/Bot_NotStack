import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Bot, CheckCircle2, Eye, EyeOff, ExternalLink, Loader2, RefreshCw, Save, ShieldAlert, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { aiSettingsQuery, testAiKey, updateAiSettings } from '@/api/ai';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGuildId } from '@/hooks/use-guild';
import { errorMessage } from '@/lib/api';

export const Route = createFileRoute('/_app/servers/$guildId/_manage/ai')({ component: AiSettingsPage });

function compact(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2).replace(/\.00$/, '')}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 2).replace(/\.00$/, '')}K`;
    return String(value);
}

function Progress({ current, limit, cooldown }: { current: number; limit: number; cooldown: boolean }) {
    const ratio = Math.min(100, (current / Math.max(1, limit)) * 100);
    const color = cooldown || ratio >= 100 ? '#ef4444' : ratio > 70 ? '#f59e0b' : '#cbd5e1';
    return <div className="space-y-1.5"><div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full transition-all" style={{ width: `${ratio}%`, backgroundColor: color }} /></div><div className="text-xs tabular-nums text-muted-foreground">{compact(current)} / {compact(limit)}</div></div>;
}

function AiSettingsPage() {
    const guildId = useGuildId();
    const client = useQueryClient();
    const query = aiSettingsQuery(guildId);
    const { data, isLoading, refetch, isFetching } = useQuery(query);
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [dailyLimit, setDailyLimit] = useState('500');
    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
    const canEnable = Boolean(data?.hasKey || data?.hasFallbackHomeKey);
    const savedDailyLimit = data?.dailyLimit;

    useEffect(() => { if (savedDailyLimit !== undefined) setDailyLimit(String(savedDailyLimit)); }, [savedDailyLimit]);

    const save = useMutation({
        mutationFn: () => updateAiSettings(guildId, { ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), dailyLimit: Number(dailyLimit) }),
        onSuccess: (next) => { setApiKey(''); setTestResult(null); client.setQueryData(query.queryKey, next); toast.success('บันทึกการตั้งค่า AI แล้ว'); },
        onError: (error) => toast.error('บันทึกไม่สำเร็จ', { description: errorMessage(error) }),
    });
    const toggle = useMutation({
        mutationFn: (aiEnabled: boolean) => updateAiSettings(guildId, { aiEnabled }),
        onSuccess: (next) => { client.setQueryData(query.queryKey, next); toast.success(next.aiEnabled ? 'เปิดใช้งาน AI แล้ว' : 'ปิดใช้งาน AI แล้ว'); },
        onError: (error) => toast.error('เปลี่ยนสถานะไม่สำเร็จ', { description: errorMessage(error) }),
    });
    const removeKey = useMutation({
        mutationFn: () => updateAiSettings(guildId, { apiKey: null }),
        onSuccess: (next) => { client.setQueryData(query.queryKey, next); setApiKey(''); toast.success('ลบ API Key แล้ว'); },
        onError: (error) => toast.error('ลบ Key ไม่สำเร็จ', { description: errorMessage(error) }),
    });
    const test = useMutation({
        mutationFn: () => testAiKey(guildId, apiKey.trim() || undefined),
        onSuccess: (result) => {
            setTestResult(result);
            if (result.ok) toast.success(result.message);
            else toast.error(result.message);
        },
        onError: (error) => { setTestResult({ ok: false, message: errorMessage(error) }); toast.error('ทดสอบ Key ไม่สำเร็จ', { description: errorMessage(error) }); },
    });

    return <div className="space-y-6">
        <PageHeader title="ตั้งค่า AI Chat" description="จัดการ Gemini API Key และติดตามโควตาการใช้งาน AI ของเซิร์ฟเวอร์นี้" />
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Bot className="size-5 text-indigo-400" />สถานะและ Gemini API Key</CardTitle><CardDescription>Key จะถูกเข้ารหัสก่อนบันทึก และใช้แยกเฉพาะเซิร์ฟเวอร์นี้</CardDescription></CardHeader>
            <CardContent className="space-y-5">
                {isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />กำลังโหลดการตั้งค่า...</div> : <>
                    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                        <div className="space-y-1"><div className="font-medium">ระบบ AI {data?.aiEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</div><p className="max-w-2xl text-sm text-muted-foreground">{data?.aiEnabled ? 'บอทจะตอบเมื่อถูกแท็กและใช้ AI ช่วยกรองข้อความในเซิร์ฟเวอร์นี้' : 'เมื่อปิด บอทจะไม่ตอบแชทเมื่อถูกแท็กและไม่ใช้ AI ช่วยกรองคำหยาบในเซิร์ฟเวอร์นี้'}</p></div>
                        <div className="flex items-center gap-3"><span className={data?.aiEnabled ? 'text-sm text-emerald-400' : 'text-sm text-muted-foreground'}>{data?.aiEnabled ? 'เปิด' : 'ปิด'}</span><Switch checked={Boolean(data?.aiEnabled)} disabled={toggle.isPending || (!data?.aiEnabled && !canEnable)} onCheckedChange={(checked) => toggle.mutate(checked)} /></div>
                    </div>
                    {!data?.aiEnabled && !canEnable && <p className="-mt-2 text-sm text-amber-400">บันทึก Gemini API Key ก่อน จึงจะเปิดใช้งาน AI ได้</p>}
                    {data?.isUsingFallbackHomeKey && <p className="rounded-md border border-indigo-400/30 bg-indigo-400/5 p-3 text-sm text-indigo-200">เซิร์ฟเวอร์หลักกำลังใช้ Key สำรองจากการตั้งค่าระบบ ({data.maskedKey ?? 'GEMINI_KEY'})</p>}
                    <div className="grid gap-2"><Label htmlFor="gemini-key">Gemini API Key</Label><div className="flex gap-2"><Input id="gemini-key" type={showKey ? 'text' : 'password'} autoComplete="off" placeholder={data?.maskedKey ?? 'วาง Gemini API Key ที่นี่'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><Button variant="outline" size="icon" aria-label={showKey ? 'ซ่อน Key' : 'แสดง Key'} onClick={() => setShowKey(!showKey)}>{showKey ? <EyeOff /> : <Eye />}</Button></div><p className="text-xs text-muted-foreground">{data?.hasKey ? `ตั้งค่าแล้ว: ${data.maskedKey}` : 'ยังไม่ได้ตั้งค่า Key สำหรับเซิร์ฟเวอร์นี้'}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" disabled={test.isPending || (!apiKey.trim() && !data?.hasKey && !data?.isUsingFallbackHomeKey)} onClick={() => test.mutate()}>{test.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}ทดสอบ Key</Button>
                        <Button disabled={save.isPending || (!apiKey.trim() && Number(dailyLimit) === data?.dailyLimit)} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />}บันทึกการตั้งค่า</Button>
                        {data?.hasKey && <Button variant="destructive" disabled={removeKey.isPending} onClick={() => removeKey.mutate()}>{removeKey.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}ลบ Key</Button>}
                        {testResult && <span className={testResult.ok ? 'text-sm text-emerald-400' : 'text-sm text-red-400'}>{testResult.message}</span>}
                    </div>
                    <div className="grid max-w-sm gap-2"><Label htmlFor="daily-limit">ลิมิตคำขอต่อวันของเซิร์ฟเวอร์</Label><Input id="daily-limit" type="number" min="1" max="100000" value={dailyLimit} onChange={(event) => setDailyLimit(event.target.value)} /></div>
                    <div className="rounded-lg border bg-muted/20 p-4 text-sm"><p className="mb-1 font-medium">ขอ API Key ฟรีจาก Google AI Studio</p><p className="text-muted-foreground">สร้าง API Key ในบัญชี Google แล้วนำมาวางด้านบน เพื่อให้เซิร์ฟเวอร์ใช้โควตาของตัวเอง</p><a className="mt-2 inline-flex items-center gap-1 text-indigo-300 hover:underline" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">เปิด Google AI Studio <ExternalLink className="size-3.5" /></a></div>
                </>}
            </CardContent>
        </Card>
        <Card>
            <CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>Gemini API Rate Limit &amp; Usage</CardTitle><CardDescription className="mt-1">คำขอวันนี้ {data?.todayTotalRequests ?? 0} รายการ · อัปเดตอัตโนมัติทุก 20 วินาที</CardDescription></div><Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>{isFetching ? <Loader2 className="animate-spin" /> : <RefreshCw />}รีเฟรช</Button></div></CardHeader>
            <CardContent><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="px-3 py-3 font-medium">Model</th><th className="px-3 py-3 font-medium">Category</th><th className="w-44 px-3 py-3 font-medium">RPM (คำขอ/นาที)</th><th className="w-44 px-3 py-3 font-medium">TPM (โทเคน/นาที)</th><th className="w-44 px-3 py-3 font-medium">RPD (คำขอ/วัน)</th></tr></thead><tbody>{data?.models.map((model) => {
                const cooldownSeconds = model.cooldownUntil ? Math.max(0, Math.ceil((model.cooldownUntil - Date.now()) / 1000)) : 0;
                const modelLabel = model.name.replace('gemini-', 'Gemini ').replaceAll('-', ' ').replace(/\bflash\b/i, 'Flash').replace(/\blite\b/i, 'Lite');
                return <tr key={model.name} className="border-b last:border-0"><td className="px-3 py-4"><div className="flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${model.status === 'cooldown' ? 'bg-red-500' : 'bg-emerald-500'}`} />{modelLabel}</div>{cooldownSeconds > 0 && <div className="mt-1 flex items-center gap-1 text-xs text-red-400"><ShieldAlert className="size-3" />พักอีก {cooldownSeconds} วินาที</div>}</td><td className="px-3 py-4 text-muted-foreground">{model.category}</td><td className="px-3 py-4"><Progress current={model.rpm.current} limit={model.rpm.limit} cooldown={model.status === 'cooldown'} /></td><td className="px-3 py-4"><Progress current={model.tpm.current} limit={model.tpm.limit} cooldown={model.status === 'cooldown'} /></td><td className="px-3 py-4"><Progress current={model.rpd.current} limit={model.rpd.limit} cooldown={model.status === 'cooldown'} /></td></tr>;
            })}</tbody></table></div></CardContent>
        </Card>
    </div>;
}
