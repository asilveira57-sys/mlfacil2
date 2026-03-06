import { useState } from 'react';

export default function NotesMini() {
  const [text, setText] = useState('');

  return (
    <textarea
      value={text}
      onChange={e => setText(e.target.value)}
      placeholder="Suas anotações rápidas..."
      className="w-full h-24 resize-none rounded-md border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
    />
  );
}
