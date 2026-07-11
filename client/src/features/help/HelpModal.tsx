import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';
// Single source of truth: the user manual lives in UPUTA.md at the repo root.
import upute from '../../../../UPUTA.md?raw';

// Flattens a React children tree to plain text (used to pick a callout tone
// from a blockquote's leading emoji).
function toText(children: React.ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(toText).join('');
  if (children && typeof children === 'object' && 'props' in (children as any))
    return toText((children as any).props?.children);
  return '';
}

// Design-system styled renderers — turns plain markdown into a graphically
// structured document (accent headings, coloured callouts, styled tables).
const components: Components = {
  h1: ({ children }) => (
    <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-8 flex items-center gap-2 border-b border-border pb-2 text-lg font-semibold text-foreground first:mt-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mb-1.5 mt-5 text-base font-semibold text-foreground">{children}</h3>,
  p: ({ children }) => <p className="my-2.5 text-[15px] leading-relaxed text-foreground/85">{children}</p>,
  ul: ({ children }) => <ul className="my-2.5 list-disc space-y-1.5 pl-5 marker:text-primary">{children}</ul>,
  ol: ({ children }) => (
    <ol className="my-2.5 list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1 text-[15px] leading-relaxed text-foreground/85">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
  em: ({ children }) => <em className="italic text-muted">{children}</em>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.85em] font-medium text-foreground">{children}</code>
  ),
  hr: () => <hr className="my-6 border-border" />,
  blockquote: ({ children }) => {
    const text = toText(children);
    const tone = /⚠/.test(text)
      ? 'border-warning/50 bg-warning-soft'
      : /✅/.test(text)
        ? 'border-success/50 bg-success-soft'
        : 'border-info/50 bg-info-soft';
    return (
      <div className={cn('my-4 rounded-xl border-l-4 px-4 py-3 text-[15px] leading-relaxed [&>p]:my-0 [&>p]:text-foreground/85', tone)}>
        {children}
      </div>
    );
  },
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-surface-2 text-left">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-medium text-foreground">{children}</th>,
  td: ({ children }) => <td className="border-t border-border px-3 py-2 text-foreground/85">{children}</td>,
};

export default function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Pomoć">
      <div className="pb-2">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {upute}
        </ReactMarkdown>
      </div>
    </Modal>
  );
}
