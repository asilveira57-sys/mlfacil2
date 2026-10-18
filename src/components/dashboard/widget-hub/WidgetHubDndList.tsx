import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { WidgetCard } from './WidgetCard';

interface Props {
  userWidgets: any[];
  catalogMap: Map<string, { nome: string; icone: string | null }>;
  onReorder: (ids: string[]) => void;
}

export default function WidgetHubDndList({ userWidgets, catalogMap, onReorder }: Props) {
  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = [...userWidgets];
    const [moved] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, moved);
    onReorder(items.map(i => i.id));
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <Droppable droppableId="widget-hub" direction="horizontal">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-auto"
          >
            {userWidgets.map((w, index) => {
              const info = catalogMap.get(w.widget_slug);
              return (
                <Draggable key={w.id} draggableId={w.id} index={index} isDragDisabled={w.fixado}>
                  {(prov) => (
                    <div ref={prov.innerRef} {...prov.draggableProps} className="animate-fade-in">
                      <WidgetCard
                        widget={w}
                        catalogName={info?.nome ?? w.widget_slug}
                        catalogIcon={info?.icone ?? null}
                        dragHandleProps={prov.dragHandleProps}
                      />
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
