import React from 'react';
import { ChevronDown, Check, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import type { Workspace } from '@/types/tasks';

interface WorkspaceSwitcherProps {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  onSwitch: (workspaceId: string) => void;
  onCreateNew?: () => void;
}

export function WorkspaceSwitcher({ 
  currentWorkspace, 
  workspaces, 
  onSwitch,
  onCreateNew 
}: WorkspaceSwitcherProps) {
  if (!currentWorkspace) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          {currentWorkspace.name}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {workspaces.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onClick={() => onSwitch(ws.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{ws.name}</span>
            {ws.id === currentWorkspace.id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        {onCreateNew && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Criar novo workspace
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
