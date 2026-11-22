import { tr, byLang } from '../../lib/i18n';
import {
    Bold,
    Code,
    Eye,
    Heading1,
    Heading2,
    Heading3,
    Italic,
    Link,
    List,
    Quote,
    SquareCode,
    Strikethrough,
    Underline,
    type LucideIcon,
} from '@/components/icons';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type MarkdownAction = 'bold' | 'italic' | 'underline' | 'strike' | 'h1' | 'h2' | 'h3' | 'quote' | 'list' | 'code' | 'codeblock' | 'spoiler' | 'link';

const WRAP = byLang((): Partial<Record<MarkdownAction, [string, string, string]>> => ({
    bold: ['**', '**', tr('news.boldText')],
    italic: ['*', '*', tr('news.italicText')],
    underline: ['__', '__', tr('news.underlinedText')],
    strike: ['~~', '~~', tr('news.strikethroughText')],
    code: ['`', '`', 'code'],
    codeblock: ['```\n', '\n```', 'code'],
    spoiler: ['||', '||', tr('news.hiddenText')],
}));

const PREFIX: Partial<Record<MarkdownAction, string>> = { h1: '# ', h2: '## ', h3: '### ', quote: '> ', list: '- ' };

const BUTTONS = byLang((): ({ action: MarkdownAction; icon: LucideIcon; title: string } | 'sep')[] => [
    { action: 'bold', icon: Bold, title: tr('news.boldCtrlBText') },
    { action: 'italic', icon: Italic, title: tr('news.italicCtrlIText') },
    { action: 'underline', icon: Underline, title: tr('news.underlineCtrlUText') },
    { action: 'strike', icon: Strikethrough, title: tr('news.strikethroughText2') },
    'sep',
    { action: 'h1', icon: Heading1, title: tr('news.largeHeadingText') },
    { action: 'h2', icon: Heading2, title: tr('news.mediumHeadingText') },
    { action: 'h3', icon: Heading3, title: tr('news.smallHeadingText') },
    'sep',
    { action: 'quote', icon: Quote, title: tr('news.quoteText') },
    { action: 'list', icon: List, title: tr('news.listText') },
    { action: 'code', icon: Code, title: tr('news.inlineCodeText') },
    { action: 'codeblock', icon: SquareCode, title: tr('news.codeBlockText') },
    { action: 'spoiler', icon: Eye, title: tr('news.spoilerText') },
    { action: 'link', icon: Link, title: tr('news.linkTextUrl') },
]);

/**
 * ครอบข้อความที่เลือก หรือเติมหน้าบรรทัด (กดซ้ำเพื่อเอาออก) แล้วคืนข้อความใหม่ + ตำแหน่งที่จะเลือกต่อ
 */
export function applyMarkdown(value: string, start: number, end: number, action: MarkdownAction): { value: string; selection: [number, number] } {
    const selected = value.slice(start, end);

    if (action === 'link') {
        const inserted = `[${selected || tr('news.linkText')}](https://)`;
        const cursor = start + inserted.length - 1; // วางเคอร์เซอร์ไว้ท้าย https:// ให้พิมพ์ URL ต่อได้เลย
        return { value: value.slice(0, start) + inserted + value.slice(end), selection: [cursor, cursor] };
    }

    const prefix = PREFIX[action];
    if (prefix) {
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const nextBreak = value.indexOf('\n', end);
        const lineEnd = nextBreak === -1 ? value.length : nextBreak;
        const lines = value.slice(lineStart, lineEnd).split('\n');
        const allPrefixed = lines.every((line) => line.startsWith(prefix));
        const next = lines.map((line) => (allPrefixed ? line.slice(prefix.length) : prefix + line)).join('\n');
        return { value: value.slice(0, lineStart) + next + value.slice(lineEnd), selection: [lineStart, lineStart + next.length] };
    }

    const [open, close, placeholder] = WRAP()[action]!;
    const body = selected || placeholder;
    return { value: value.slice(0, start) + open + body + close + value.slice(end), selection: [start + open.length, start + open.length + body.length] };
}

// แถบปุ่มจัดรูปแบบตาม Markdown ของ Discord
export function MarkdownToolbar({ textareaRef, onApply }: { textareaRef: RefObject<HTMLTextAreaElement | null>; onApply: (action: MarkdownAction) => void }) {
    return (
        <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 bg-muted/40 p-1">
            {BUTTONS().map((button, i) =>
                button === 'sep' ? (
                    <Separator key={`sep-${i}`} orientation="vertical" className="mx-1 h-5" />
                ) : (
                    <Tooltip key={button.action}>
                        <TooltipTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                aria-label={button.title}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                    onApply(button.action);
                                    textareaRef.current?.focus();
                                }}
                            >
                                <button.icon />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>{button.title}</TooltipContent>
                    </Tooltip>
                ),
            )}
        </div>
    );
}
