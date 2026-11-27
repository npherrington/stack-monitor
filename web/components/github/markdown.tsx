import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const SAFE_LINK = /^(https?:|mailto:)/i

// Other people's markdown, built as React elements. Raw HTML in it (an HTML comment, a bot's
// <details>) is skipped, so neither runs nor shows as text; what's between the tags still shows.
const COMPONENTS: Components = {
  a: ({ href, children }) =>
    href !== undefined && SAFE_LINK.test(href) ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2"
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // The CSP blocks remote images, which would tell their host when the PR was read: a link instead.
  img: ({ src, alt }) =>
    typeof src === 'string' && SAFE_LINK.test(src) ? (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
      >
        {alt === undefined || alt === '' ? 'image' : `image: ${alt}`}
      </a>
    ) : null,
  h1: ({ children }) => (
    <h3 className="text-base font-semibold text-strong">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="text-base font-semibold text-strong">{children}</h3>
  ),
  h3: ({ children }) => (
    <h4 className="text-sm font-semibold text-strong">{children}</h4>
  ),
  ul: ({ children }) => <ul className="list-disc pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5">{children}</ol>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
      {children}
    </pre>
  ),
  code: ({ children, className }) => (
    <code
      className={
        className === undefined
          ? 'rounded bg-muted px-1 py-0.5 font-mono text-xs'
          : 'font-mono'
      }
    >
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="text-xs [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:px-2 [&_th]:py-1">
        {children}
      </table>
    </div>
  ),
}

interface MarkdownProps {
  text: string
}

export function Markdown({ text }: MarkdownProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={COMPONENTS}
        skipHtml
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}
