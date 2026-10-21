import { formatBaht, roundMoney, type FundMemberView, type FundPaymentView } from '@notstack/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Banknote, Calendar, Download, Loader2, Lock, LockOpen, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { fundApi, fundQuery } from '@/api/fund';
import { useConfirm } from '@/components/confirm-dialog';
import { FundTopicPanelSkeleton } from '@/components/skeleton/editor-pages';
import { ErrorState } from '@/components/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useGuildId } from '@/hooks/use-guild';
import { TopicAnalyticsTab } from './analytics-tab';
import { BatchPaymentDialog } from './batch-payment-dialog';
import { MembersTab } from './members-tab';
import { PaymentDialog } from './payment-dialog';
import { PaymentsTab } from './payments-tab';
import { ProgressBar } from './progress-bar';
import { ReportCard } from './report-card';
import { StatTile } from './stat-tile';
import { TopicDialog } from './topic-dialog';
import { dailyRateOf, downloadFundCsv, onFundError, percent, useFundRefresh } from './utils';

// ==========================================
// 🗂️ แผงจัดการหัวข้อที่เลือก — สรุปยอด / ส่งรายงาน / แท็บรายชื่อ-ประวัติ-กราฟ / dialog ต่างๆ
// ==========================================
export function TopicPanel({ topicId, onDeleted }: { topicId: number; onDeleted: () => void }) {
    const guildId = useGuildId();
    const refresh = useFundRefresh();
    const confirm = useConfirm();
    const query = useQuery(fundQuery(guildId, topicId));
    const [editOpen, setEditOpen] = useState(false);
    const [payOpen, setPayOpen] = useState(false);
    const [batchOpen, setBatchOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [payMember, setPayMember] = useState<FundMemberView | null>(null);
    const [editingPayment, setEditingPayment] = useState<FundPaymentView | null>(null);

    const toggleClosed = useMutation({
        mutationFn: (closed: boolean) => fundApi.update(guildId, topicId, { closed }),
        onSuccess: (topic) => {
            toast.success(topic.closed ? 'ปิดการเก็บเงินแล้ว' : 'เปิดการเก็บเงินอีกครั้ง');
            void refresh();
        },
        onError: onFundError,
    });

    if (query.isLoading) return <FundTopicPanelSkeleton />;
    if (query.error) return <ErrorState error={query.error} />;
    const topic = query.data;
    if (!topic) return null;

    const handleExport = async () => {
        setExporting(true);
        try {
            // ส่งออกทันทีจากข้อมูลที่โหลดอยู่ในหน้าเว็บ (รวดเร็ว ไม่ติดปัญหา CORS/Session หมดอายุ)
            downloadFundCsv(topic);
            toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
        } catch {
            // Fallback เรียก API กรณีฉุกเฉิน
            try {
                await fundApi.exportCsv(guildId, topicId);
                toast.success('ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว');
            } catch (err) {
                onFundError(err);
            }
        } finally {
            setExporting(false);
        }
    };

    const remove = async () => {
        const ok = await confirm({
            title: 'ลบหัวข้อเก็บเงิน?',
            description: `“${topic.name}” พร้อมรายชื่อ ${topic.memberCount} คนและรายการรับเงินทั้งหมดจะถูกลบถาวร`,
            confirmText: 'ลบหัวข้อ',
            destructive: true,
        });
        if (!ok) return;
        try {
            await fundApi.remove(guildId, topic.id);
            toast.success('ลบหัวข้อแล้ว');
            await refresh();
            onDeleted();
        } catch (err) {
            onFundError(err);
        }
    };

    const dailyRate = dailyRateOf(topic);
    const pct = percent(topic.collected, topic.target);
    const remaining = Math.max(0, roundMoney(topic.target - topic.collected));

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex-row items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                            <span className="truncate">{topic.name}</span>
                            {topic.closed && (
                                <Badge variant="secondary">
                                    <Lock /> ปิดแล้ว
                                </Badge>
                            )}
                        </CardTitle>
                        {topic.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{topic.description}</p>}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {dailyRate ? (
                                <Badge variant="secondary" className="font-normal border-primary/30 bg-primary/10 text-primary">
                                    📅 เก็บวันละ {formatBaht(dailyRate)}
                                    {topic.startDate && ` (เริ่ม ${new Date(topic.startDate).toLocaleDateString('th-TH')})`}
                                </Badge>
                            ) : (
                                <span>ยอดต่อคน {formatBaht(topic.amountPerMember)}</span>
                            )}
                            {topic.dueDate && <span>· ครบกำหนด {new Date(topic.dueDate).toLocaleDateString('th-TH', { dateStyle: 'medium' })}</span>}
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleExport()}
                            disabled={exporting}
                            title="ดาวน์โหลดข้อมูลสรุป รายชื่อสมาชิก และประวัติการรับเงินเป็นไฟล์ CSV (เปิดใน Excel ได้ทันที)"
                        >
                            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                            {exporting ? 'กำลังส่งออก...' : 'Export CSV'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => toggleClosed.mutate(!topic.closed)} disabled={toggleClosed.isPending}>
                            {topic.closed ? <LockOpen /> : <Lock />} {topic.closed ? 'เปิดอีกครั้ง' : 'ปิดการเก็บ'}
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditOpen(true)} aria-label="แก้ไขหัวข้อ">
                            <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => void remove()} aria-label="ลบหัวข้อ">
                            <Trash2 className="text-destructive" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {topic.closed && (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                            <Lock className="size-4 shrink-0" />
                            <span>หัวข้อนี้ปิดการเก็บเงินแล้ว — หากต้องการเพิ่ม/ลบคนหรือบันทึก/แก้ไขรับเงิน กรุณากด “เปิดอีกครั้ง” ด้านบน</span>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        <StatTile label="🎯 เป้าหมายรวม" value={formatBaht(topic.target)} variant="summary" />
                        <StatTile label="💵 เก็บได้แล้ว" value={formatBaht(topic.collected)} valueClassName="text-emerald-400" variant="summary" />
                        <StatTile label="⏳ คงค้างรวม" value={formatBaht(remaining)} valueClassName={remaining > 0 ? 'text-amber-400' : ''} variant="summary" />
                        <StatTile label="👥 จ่ายครบ" value={`${topic.paidCount} / ${topic.memberCount} คน`} variant="summary" />
                    </div>
                    <div className="flex items-center gap-3">
                        <ProgressBar value={pct} />
                        <span className="w-12 text-right text-sm font-medium tabular-nums">{pct}%</span>
                    </div>
                </CardContent>
            </Card>

            <ReportCard topic={topic} />

            <Card>
                <CardContent>
                    <Tabs defaultValue="members">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <TabsList>
                                <TabsTrigger value="members">รายชื่อ ({topic.memberCount})</TabsTrigger>
                                <TabsTrigger value="payments">ประวัติรับเงิน ({topic.payments.length})</TabsTrigger>
                                <TabsTrigger value="analytics">📊 แดชบอร์ด & กราฟ</TabsTrigger>
                            </TabsList>
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => setBatchOpen(true)}
                                    title="บันทึกรับเงินสำหรับห้วงเวลาเดียวกันให้กับหลายคนพร้อมกัน"
                                >
                                    <Calendar /> บันทึกตามห้วงเวลา (หลายคน)
                                </Button>
                                <Button
                                    size="sm"
                                    disabled={topic.closed || topic.members.length === 0}
                                    onClick={() => {
                                        setPayMember(null);
                                        setEditingPayment(null);
                                        setPayOpen(true);
                                    }}
                                >
                                    <Banknote /> บันทึกการรับเงิน
                                </Button>
                            </div>
                        </div>
                        <TabsContent value="members">
                            <MembersTab
                                topic={topic}
                                onPay={(member) => {
                                    setPayMember(member);
                                    setEditingPayment(null);
                                    setPayOpen(true);
                                }}
                            />
                        </TabsContent>
                        <TabsContent value="payments">
                            <PaymentsTab
                                topic={topic}
                                onEditPayment={(payment) => {
                                    setPayMember(null);
                                    setEditingPayment(payment);
                                    setPayOpen(true);
                                }}
                            />
                        </TabsContent>
                        <TabsContent value="analytics">
                            <TopicAnalyticsTab topic={topic} />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            <TopicDialog open={editOpen} onOpenChange={setEditOpen} topic={topic} />
            <PaymentDialog
                topic={topic}
                member={payMember}
                payment={editingPayment}
                open={payOpen}
                onOpenChange={(open) => {
                    setPayOpen(open);
                    if (!open) setEditingPayment(null);
                }}
            />
            <BatchPaymentDialog topic={topic} open={batchOpen} onOpenChange={setBatchOpen} />
        </div>
    );
}
