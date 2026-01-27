import { cn } from '@/lib/utils';
import type { ModuleTag } from '@/types/module-tags';

interface ModuleTagBadgeProps {
  tag: ModuleTag;
  size?: 'sm' | 'md';
  className?: string;
}

export function ModuleTagBadge({ tag, size = 'sm', className }: ModuleTagBadgeProps) {
  const baseClasses = cn(
    'inline-flex items-center font-medium whitespace-nowrap',
    size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5',
    tag.style === 'selo' ? 'rounded-sm' : 'rounded-full',
    className
  );

  return (
    <span
      className={baseClasses}
      style={{
        backgroundColor: `${tag.color}20`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      {tag.name}
    </span>
  );
}

interface ModuleTagsDisplayProps {
  tags: ModuleTag[];
  size?: 'sm' | 'md';
  maxDisplay?: number;
}

export function ModuleTagsDisplay({ tags, size = 'sm', maxDisplay = 2 }: ModuleTagsDisplayProps) {
  if (!tags || tags.length === 0) return null;

  const sortedTags = [...tags].sort((a, b) => a.priority - b.priority);
  const displayTags = sortedTags.slice(0, maxDisplay);
  const remaining = sortedTags.length - maxDisplay;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {displayTags.map((tag) => (
        <ModuleTagBadge key={tag.id} tag={tag} size={size} />
      ))}
      {remaining > 0 && (
        <span className="text-[10px] text-muted-foreground">+{remaining}</span>
      )}
    </div>
  );
}
