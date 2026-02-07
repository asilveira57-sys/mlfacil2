import type { DesignTokens } from '@/types/templates';

interface TemplateColorPreviewProps {
  tokens: DesignTokens;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/** Renders a mini color swatch bar from design tokens */
export function TemplateColorPreview({ tokens, size = 'md', className = '' }: TemplateColorPreviewProps) {
  const colors = [
    { key: 'primary', value: tokens.primary },
    { key: 'secondary', value: tokens.secondary },
    { key: 'accent', value: tokens.accent },
    { key: 'background', value: tokens.background },
    { key: 'muted', value: tokens.muted },
    { key: 'sidebar_background', value: tokens.sidebar_background },
  ].filter(c => c.value);

  const heights: Record<string, string> = { sm: 'h-4', md: 'h-6', lg: 'h-8' };

  return (
    <div className={`flex rounded-md overflow-hidden border ${heights[size]} ${className}`}>
      {colors.map((c, i) => (
        <div
          key={c.key}
          className="flex-1 min-w-0"
          style={{ background: `hsl(${c.value})` }}
          title={c.key}
        />
      ))}
    </div>
  );
}

/** Renders a mini dashboard mockup with actual template colors */
export function TemplateMiniPreview({ tokens, className = '' }: { tokens: DesignTokens; className?: string }) {
  const hsl = (v?: string) => v ? `hsl(${v})` : undefined;

  return (
    <div
      className={`rounded-lg border overflow-hidden relative ${className}`}
      style={{ background: hsl(tokens.background) || 'hsl(var(--background))' }}
    >
      {/* Sidebar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[20%]"
        style={{ background: hsl(tokens.sidebar_background) || 'hsl(var(--sidebar-background))' }}
      >
        <div className="p-1 space-y-1 mt-2">
          <div className="h-1 rounded-full mx-1" style={{ background: hsl(tokens.sidebar_primary) || 'hsl(var(--sidebar-primary))', opacity: 0.8 }} />
          <div className="h-0.5 rounded-full mx-1 opacity-40" style={{ background: hsl(tokens.sidebar_foreground) || 'hsl(var(--sidebar-foreground))' }} />
          <div className="h-0.5 rounded-full mx-1 opacity-30" style={{ background: hsl(tokens.sidebar_foreground) || 'hsl(var(--sidebar-foreground))' }} />
        </div>
      </div>
      {/* Main content */}
      <div className="ml-[22%] p-1.5 space-y-1">
        {/* Header bar */}
        <div className="h-1.5 rounded-sm w-2/3" style={{ background: hsl(tokens.primary) || 'hsl(var(--primary))' }} />
        {/* Cards row */}
        <div className="flex gap-1">
          <div
            className="flex-1 h-4 rounded-sm"
            style={{ background: hsl(tokens.card) || 'hsl(var(--card))', border: `1px solid ${hsl(tokens.border) || 'hsl(var(--border))'}` }}
          />
          <div
            className="flex-1 h-4 rounded-sm"
            style={{ background: hsl(tokens.card) || 'hsl(var(--card))', border: `1px solid ${hsl(tokens.border) || 'hsl(var(--border))'}` }}
          />
        </div>
        {/* Accent element */}
        <div className="h-1 rounded-sm w-1/3" style={{ background: hsl(tokens.accent) || 'hsl(var(--accent))' }} />
        {/* Content lines */}
        <div className="h-0.5 rounded-full w-4/5 opacity-50" style={{ background: hsl(tokens.muted_foreground) || 'hsl(var(--muted-foreground))' }} />
        <div className="h-0.5 rounded-full w-3/5 opacity-30" style={{ background: hsl(tokens.muted_foreground) || 'hsl(var(--muted-foreground))' }} />
      </div>
    </div>
  );
}
