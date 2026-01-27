import { useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Tag,
  Zap,
  MoreVertical,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { QaLibraryResponse, QaResponseCategory } from "@/types/qa";
import { useCreateLibraryResponse, useResponseCategories } from "@/hooks/useQA";

interface QaLibraryPanelProps {
  responses: QaLibraryResponse[];
  loading: boolean;
  sellerId: string;
  onSelect: (response: QaLibraryResponse) => void;
}

export function QaLibraryPanel({
  responses,
  loading,
  sellerId,
  onSelect,
}: QaLibraryPanelProps) {
  const [search, setSearch] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const filteredResponses = search
    ? responses.filter(
        (r) =>
          r.name.toLowerCase().includes(search.toLowerCase()) ||
          r.content.toLowerCase().includes(search.toLowerCase()) ||
          r.tags.some((t) => t.toLowerCase().includes(search.toLowerCase()))
      )
    : responses;

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-8 w-full" />
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Biblioteca</span>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Nova
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Resposta</DialogTitle>
              </DialogHeader>
              <AddResponseForm
                sellerId={sellerId}
                onSuccess={() => setIsAddDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar resposta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-8 text-xs"
          />
        </div>
      </div>

      {/* Responses List */}
      <ScrollArea className="flex-1">
        {filteredResponses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center px-4">
            <BookOpen className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {search
                ? "Nenhuma resposta encontrada"
                : "Adicione respostas padrão para agilizar o atendimento"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredResponses.map((response) => (
              <ResponseItem
                key={response.id}
                response={response}
                onSelect={() => onSelect(response)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

interface ResponseItemProps {
  response: QaLibraryResponse;
  onSelect: () => void;
}

function ResponseItem({ response, onSelect }: ResponseItemProps) {
  return (
    <div className="p-3 hover:bg-accent/50 transition-colors group">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={onSelect}
          className="flex-1 text-left min-w-0"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium truncate">{response.name}</span>
            {response.shortcut && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                <Zap className="h-2 w-2 mr-0.5" />
                {response.shortcut}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {response.content}
          </p>
          {response.tags.length > 0 && (
            <div className="flex items-center gap-1 mt-2 flex-wrap">
              {response.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="outline"
                  className="text-[10px] px-1 py-0"
                >
                  <Tag className="h-2 w-2 mr-0.5" />
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSelect}>
              <Check className="h-3 w-3 mr-2" />
              Usar resposta
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Pencil className="h-3 w-3 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive">
              <Trash2 className="h-3 w-3 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
        <span>Usado {response.usage_count}x</span>
        {response.category && (
          <>
            <span>•</span>
            <span>{response.category.name}</span>
          </>
        )}
      </div>
    </div>
  );
}

interface AddResponseFormProps {
  sellerId: string;
  onSuccess: () => void;
}

function AddResponseForm({ sellerId, onSuccess }: AddResponseFormProps) {
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [tags, setTags] = useState("");
  const [categoryId, setCategoryId] = useState("");

  const { toast } = useToast();
  const { data: categories } = useResponseCategories(sellerId);
  const createResponse = useCreateLibraryResponse();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !content.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o nome e o conteúdo da resposta",
        variant: "destructive",
      });
      return;
    }

    await createResponse.mutateAsync({
      seller_id: sellerId,
      name: name.trim(),
      content: content.trim(),
      shortcut: shortcut.trim() || undefined,
      category_id: categoryId || undefined,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Prazo de entrega"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Conteúdo *</Label>
        <Textarea
          id="content"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Digite o texto da resposta..."
          className="min-h-[100px]"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="shortcut">Atalho</Label>
          <Input
            id="shortcut"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="/frete"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
        <Input
          id="tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="frete, prazo, entrega"
        />
      </div>

      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={createResponse.isPending}>
          {createResponse.isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
