import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, FileText, ShieldCheck } from '@/components/icons';
import { Fragment, useEffect, type ReactNode } from 'react';
import { appInfoQuery, DEFAULT_BOT } from '@/api/app';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/use-page-meta';
import { splitRichText, tr, type MessageKey } from '@/lib/i18n';

function LegalLayout({
    active,
    icon,
    title,
    subtitle,
    children,
}: {
    active: 'privacy' | 'terms';
    icon: ReactNode;
    title: string;
    subtitle: string;
    children: ReactNode;
}) {
    const { data: info } = useQuery(appInfoQuery);
    const bot = info?.bot ?? DEFAULT_BOT;

    useEffect(() => {
        window.scrollTo({ top: 0 });
    }, [active]);

    return (
        <div className="min-h-svh bg-background text-foreground">
            <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
                <div className="mx-auto flex h-14 max-w-4xl items-center gap-4 px-4">
                    <Link to="/" className="flex min-w-0 items-center gap-2 font-semibold">
                        <img src={bot.avatar} alt={bot.name} className="size-7 rounded-full" />
                        <span className="truncate">{bot.name}</span>
                    </Link>
                    <nav className="ml-auto flex items-center gap-4 text-sm">
                        <Link to="/privacy" className={active === 'privacy' ? 'font-medium text-indigo-300' : 'text-muted-foreground hover:text-foreground'}>
                            Privacy Policy
                        </Link>
                        <Link to="/terms" className={active === 'terms' ? 'font-medium text-indigo-300' : 'text-muted-foreground hover:text-foreground'}>
                            Terms of Service
                        </Link>
                        <Button asChild size="sm" variant="outline" className="hidden sm:inline-flex">
                            <Link to="/dashboard">Dashboard</Link>
                        </Button>
                    </nav>
                </div>
            </header>

            <main className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
                    <ArrowLeft className="size-4" /> {tr('login.backToHome')}
                </Link>

                <div className="mt-6 border-b pb-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
                        {icon}
                        <span>{tr('legal.lastUpdated', { 0: tr('legal.lastUpdatedDate') })}</span>
                    </div>
                    <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
                    <p className="mt-2 text-pretty text-muted-foreground">{subtitle}</p>
                </div>

                <div className="mt-10 space-y-8 text-sm leading-relaxed text-slate-300">{children}</div>
            </main>

            <footer className="border-t">
                <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>
                        {bot.name}
                        {info?.version ? ` v${info.version}` : ''} {tr('landing.footerBuiltBy')}
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                        <Link to="/" className="hover:text-foreground">
                            {tr('layout.home')}
                        </Link>
                        <Link to="/privacy" className="hover:text-foreground">
                            {tr('login.privacyPolicy')}
                        </Link>
                        <Link to="/terms" className="hover:text-foreground">
                            {tr('login.termsOfService')}
                        </Link>
                        <Link to="/dashboard" className="hover:text-foreground">
                            Dashboard →
                        </Link>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function SectionBlock({ number, title, children }: { number: string; title: string; children: ReactNode }) {
    return (
        <section className="space-y-3 rounded-xl border bg-card/40 p-6">
            <h2 className="flex items-baseline gap-2.5 text-lg font-semibold text-foreground">
                <span className="font-mono text-xs text-indigo-300">{number}</span>
                <span>{title}</span>
            </h2>
            <div className="space-y-2.5 text-slate-300">{children}</div>
        </section>
    );
}

// ข้อความในคำแปลที่มี <b> / <code> / {slot} (ดู splitRichText)
function Rich({ k, slots }: { k: MessageKey; slots?: Record<string, ReactNode> }) {
    return splitRichText(tr(k)).map((token, i) =>
        token.tag === 'b' ? (
            <strong key={i}>{token.text}</strong>
        ) : token.tag === 'code' ? (
            <code key={i}>{token.text}</code>
        ) : token.tag === 'slot' ? (
            <Fragment key={i}>{slots?.[token.name]}</Fragment>
        ) : (
            <Fragment key={i}>{token.text}</Fragment>
        ),
    );
}

const List = ({ items }: { items: MessageKey[] }) => (
    <ul className="list-disc space-y-1.5 pl-5">
        {items.map((k) => (
            <li key={k}>
                <Rich k={k} />
            </li>
        ))}
    </ul>
);

const externalLink = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-300 underline underline-offset-4 hover:text-indigo-200">
        {label}
    </a>
);

export function PrivacyPolicyPage() {
    usePageMeta('/privacy');

    return (
        <LegalLayout active="privacy" icon={<ShieldCheck className="size-3.5" />} title={tr('privacy.title')} subtitle={tr('privacy.subtitle')}>
            <SectionBlock number="01" title={tr('privacy.collectTitle')}>
                <p>{tr('privacy.collectIntro')}</p>
                <List items={['privacy.collectGuild', 'privacy.collectAccount', 'privacy.collectFeatures', 'privacy.collectLogs']} />
            </SectionBlock>

            <SectionBlock number="02" title={tr('privacy.isolationTitle')}>
                <p>
                    <Rich k="privacy.isolationIntro" />
                </p>
                <List items={['privacy.isolationOwner', 'privacy.isolationUser', 'privacy.isolationAdmin']} />
            </SectionBlock>

            <SectionBlock number="03" title={tr('privacy.securityTitle')}>
                <List items={['privacy.securityPasswords', 'privacy.securitySecrets', 'privacy.securityWebhook', 'privacy.securitySession']} />
            </SectionBlock>

            <SectionBlock number="04" title={tr('privacy.thirdPartyTitle')}>
                <p>{tr('privacy.thirdPartyIntro')}</p>
                <List items={['privacy.thirdPartyDiscord', 'privacy.thirdPartyGemini', 'privacy.thirdPartyWeather', 'privacy.thirdPartyDev']} />
            </SectionBlock>

            <SectionBlock number="05" title={tr('privacy.retentionTitle')}>
                <List items={['privacy.retentionAuto', 'privacy.retentionKick', 'privacy.retentionRequest']} />
            </SectionBlock>
        </LegalLayout>
    );
}

export function TermsOfServicePage() {
    usePageMeta('/terms');

    return (
        <LegalLayout active="terms" icon={<FileText className="size-3.5" />} title={tr('terms.title')} subtitle={tr('terms.subtitle')}>
            <SectionBlock number="01" title={tr('terms.acceptTitle')}>
                <p>
                    <Rich
                        k="terms.acceptBody"
                        slots={{
                            tos: externalLink('https://discord.com/terms', 'Discord Terms of Service'),
                            guidelines: externalLink('https://discord.com/guidelines', 'Discord Community Guidelines'),
                        }}
                    />
                </p>
            </SectionBlock>

            <SectionBlock number="02" title={tr('terms.scopeTitle')}>
                <List items={['terms.scopeOwner', 'terms.scopeResponsibility', 'terms.scopeNoSnooping']} />
            </SectionBlock>

            <SectionBlock number="03" title={tr('terms.useTitle')}>
                <p>{tr('terms.useIntro')}</p>
                <List items={['terms.useSpam', 'terms.useAttacks', 'terms.useAbuse']} />
            </SectionBlock>

            <SectionBlock number="04" title={tr('terms.availabilityTitle')}>
                <List items={['terms.availabilityFree', 'terms.availabilityMaintenance']} />
            </SectionBlock>

            <SectionBlock number="05" title={tr('terms.liabilityTitle')}>
                <List items={['terms.liabilitySuspend', 'terms.liabilityAsIs']} />
            </SectionBlock>
        </LegalLayout>
    );
}
