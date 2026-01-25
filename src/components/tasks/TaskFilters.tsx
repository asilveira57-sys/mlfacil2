import { useState } from 'react';
import { Search, Filter, X, Calendar, User, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  TASK_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  type TaskStatus,
  type TaskPriority,
} from '@/types/tasks';
import type { WorkspaceMember, WorkspaceAccount } from '@/types/tasks';

interface TaskFiltersProps {
  filters: {
    search?: string;
    status?: TaskStatus[];
    priority?: TaskPriority[];
    assignee_user_id?: string | null;
    account_id?: string | null;
    due_filter?: 'today' | '7days' | 'overdue' | null;
    tags?: string[];
  };
  onFiltersChange: (filters: TaskFiltersProps['filters']) => void;
  members: WorkspaceMember[];
  accounts: WorkspaceAccount[];
  availableTags?: string[];
}

export function TaskFilters({
  filters,
  onFiltersChange,
  members,
  accounts,
  availableTags = [],
}: TaskFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search || '');

  const handleSearchSubmit = () => {
    onFiltersChange({ ...filters, search: searchValue || undefined });
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchSubmit();
    }
  };

  const toggleStatus = (status: TaskStatus) => {
    const current = filters.status || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFiltersChange({ ...filters, status: updated.length ? updated : undefined });
  };

  const togglePriority = (priority: TaskPriority) => {
    const current = filters.priority || [];
    const updated = current.includes(priority)
      ? current.filter(p => p !== priority)
      : [...current, priority];
    onFiltersChange({ ...filters, priority: updated.length ? updated : undefined });
  };

  const clearFilters = () => {
    setSearchValue('');
    onFiltersChange({});
  };

  const hasActiveFilters = !!(
    filters.search ||
    filters.status?.length ||
    filters.priority?.length ||
    filters.assignee_user_id !== undefined ||
    filters.account_id ||
    filters.due_filter ||
    filters.tags?.length
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar tarefas..."
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            onBlur={handleSearchSubmit}
            className="pl-9"
          />
        </div>

        {/* Status Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Status
              {filters.status?.length ? (
                <Badge variant="secondary" className="ml-1">
                  {filters.status.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="start">
            <div className="space-y-2">
              {Object.entries(TASK_STATUS_LABELS).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${value}`}
                    checked={filters.status?.includes(value as TaskStatus)}
                    onCheckedChange={() => toggleStatus(value as TaskStatus)}
                  />
                  <label
                    htmlFor={`status-${value}`}
                    className="text-sm cursor-pointer"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Priority Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Filter className="h-4 w-4" />
              Prioridade
              {filters.priority?.length ? (
                <Badge variant="secondary" className="ml-1">
                  {filters.priority.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48" align="start">
            <div className="space-y-2">
              {Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => (
                <div key={value} className="flex items-center gap-2">
                  <Checkbox
                    id={`priority-${value}`}
                    checked={filters.priority?.includes(value as TaskPriority)}
                    onCheckedChange={() => togglePriority(value as TaskPriority)}
                  />
                  <label
                    htmlFor={`priority-${value}`}
                    className="text-sm cursor-pointer"
                  >
                    {label}
                  </label>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {/* Due Date Filter */}
        <Select
          value={filters.due_filter || 'all'}
          onValueChange={value =>
            onFiltersChange({
              ...filters,
              due_filter: value === 'all' ? undefined : (value as 'today' | '7days' | 'overdue'),
            })
          }
        >
          <SelectTrigger className="w-[150px]">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Prazo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os prazos</SelectItem>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="7days">Próximos 7 dias</SelectItem>
            <SelectItem value="overdue">Atrasadas</SelectItem>
          </SelectContent>
        </Select>

        {/* Assignee Filter */}
        <Select
          value={filters.assignee_user_id === null ? 'unassigned' : filters.assignee_user_id || 'all'}
          onValueChange={value =>
            onFiltersChange({
              ...filters,
              assignee_user_id:
                value === 'all' ? undefined : value === 'unassigned' ? null : value,
            })
          }
        >
          <SelectTrigger className="w-[180px]">
            <User className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="unassigned">Sem responsável</SelectItem>
            {members.map(member => (
              <SelectItem key={member.user_id} value={member.user_id}>
                {member.user_id.slice(0, 8)}...
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Account Filter */}
        {accounts.length > 0 && (
          <Select
            value={filters.account_id || 'all'}
            onValueChange={value =>
              onFiltersChange({
                ...filters,
                account_id: value === 'all' ? undefined : value,
              })
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Conta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as contas</SelectItem>
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>

      {/* Active Filter Tags */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Busca: {filters.search}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => {
                  setSearchValue('');
                  onFiltersChange({ ...filters, search: undefined });
                }}
              />
            </Badge>
          )}
          {filters.status?.map(s => (
            <Badge key={s} variant="secondary" className="gap-1">
              {TASK_STATUS_LABELS[s]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => toggleStatus(s)}
              />
            </Badge>
          ))}
          {filters.priority?.map(p => (
            <Badge key={p} variant="secondary" className="gap-1">
              {TASK_PRIORITY_LABELS[p]}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => togglePriority(p)}
              />
            </Badge>
          ))}
          {filters.due_filter && (
            <Badge variant="secondary" className="gap-1">
              Prazo: {filters.due_filter === 'today' ? 'Hoje' : filters.due_filter === '7days' ? '7 dias' : 'Atrasadas'}
              <X
                className="h-3 w-3 cursor-pointer"
                onClick={() => onFiltersChange({ ...filters, due_filter: undefined })}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
