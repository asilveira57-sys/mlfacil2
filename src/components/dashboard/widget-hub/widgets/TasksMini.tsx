import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Task { id: string; text: string; done: boolean; }

export default function TasksMini() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [input, setInput] = useState('');

  const add = () => {
    if (!input.trim()) return;
    setTasks(t => [...t, { id: crypto.randomUUID(), text: input.trim(), done: false }]);
    setInput('');
  };

  const toggle = (id: string) => setTasks(t => t.map(x => x.id === id ? { ...x, done: !x.done } : x));

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nova tarefa..." className="h-8 text-xs" />
        <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0" onClick={add}><Plus className="h-3 w-3" /></Button>
      </div>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {tasks.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhuma tarefa</p>}
        {tasks.map(t => (
          <label key={t.id} className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={t.done} onCheckedChange={() => toggle(t.id)} />
            <span className={t.done ? 'line-through text-muted-foreground' : 'text-foreground'}>{t.text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
