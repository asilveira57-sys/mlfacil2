import { Construction } from 'lucide-react';

interface Props {
  slug?: string;
}

export default function PlaceholderWidget({ slug }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
      <Construction className="h-8 w-8 mb-2 opacity-50" />
      <span className="text-xs">Em breve</span>
    </div>
  );
}
