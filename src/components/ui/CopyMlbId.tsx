import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyMlbIdProps {
  itemId: string;
  className?: string;
}

export function CopyMlbId({ itemId, className }: CopyMlbIdProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(itemId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs text-slate-400 font-mono", className)}>
      {itemId}
      <button
        onClick={handleCopy}
        className="p-0.5 rounded hover:bg-slate-700/50 transition-colors text-slate-500 hover:text-cyan-400"
        title="Copiar MLB"
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </span>
  );
}
