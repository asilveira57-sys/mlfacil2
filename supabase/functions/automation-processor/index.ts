import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AutomationAction {
  type: 'create_task' | 'assign_to' | 'set_due_in_hours' | 'set_due_at' | 'add_checklist' | 'notify' | 'add_tag';
  params: Record<string, unknown>;
}

interface AutomationRule {
  id: string;
  workspace_id: string;
  account_id: string | null;
  is_enabled: boolean;
  name: string;
  trigger_event_type: string;
  conditions: Record<string, unknown>;
  actions: AutomationAction[];
}

interface SystemEvent {
  id: string;
  workspace_id: string;
  account_id: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { event_id } = await req.json();

    if (!event_id) {
      return new Response(
        JSON.stringify({ error: 'event_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the event
    const { data: event, error: eventError } = await supabase
      .from('system_events')
      .select('*')
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found', details: eventError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemEvent = event as SystemEvent;

    // Skip if already processed
    if (systemEvent.processed_at) {
      return new Response(
        JSON.stringify({ message: 'Event already processed', event_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch matching rules
    let rulesQuery = supabase
      .from('automation_rules')
      .select('*')
      .eq('workspace_id', systemEvent.workspace_id)
      .eq('is_enabled', true)
      .eq('trigger_event_type', systemEvent.event_type);

    // Filter by account_id if present
    if (systemEvent.account_id) {
      rulesQuery = rulesQuery.or(`account_id.is.null,account_id.eq.${systemEvent.account_id}`);
    } else {
      rulesQuery = rulesQuery.is('account_id', null);
    }

    const { data: rules, error: rulesError } = await rulesQuery;

    if (rulesError) {
      console.error('Error fetching rules:', rulesError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch rules', details: rulesError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results: { rule_id: string; task_id?: string; actions_executed: string[] }[] = [];

    for (const rule of (rules || []) as AutomationRule[]) {
      // Evaluate conditions
      if (!evaluateConditions(rule.conditions, systemEvent.payload)) {
        continue;
      }

      const actionsExecuted: string[] = [];
      let taskId: string | undefined;
      let taskData: Record<string, unknown> = {
        workspace_id: systemEvent.workspace_id,
        account_id: systemEvent.account_id,
        status: 'todo',
        priority: 'medium',
        tags: [],
      };

      // Process actions
      for (const action of rule.actions) {
        switch (action.type) {
          case 'create_task': {
            const params = action.params as {
              title?: string;
              description?: string;
              priority?: string;
              tags?: string[];
              source_type?: string;
            };

            // Check for duplicate task
            const sourceType = params.source_type || systemEvent.event_type;
            const sourceId = systemEvent.id;

            const { data: existingTask } = await supabase
              .from('tasks')
              .select('id')
              .eq('workspace_id', systemEvent.workspace_id)
              .eq('source_type', sourceType)
              .eq('source_id', sourceId)
              .neq('status', 'done')
              .limit(1);

            if (existingTask && existingTask.length > 0) {
              console.log(`Skipping duplicate task for source ${sourceType}:${sourceId}`);
              continue;
            }

            taskData = {
              ...taskData,
              title: interpolateString(params.title || 'Nova tarefa', systemEvent.payload),
              description: params.description ? interpolateString(params.description, systemEvent.payload) : null,
              priority: params.priority || 'medium',
              tags: params.tags || [],
              source_type: sourceType,
              source_id: sourceId,
              source_ref: systemEvent.payload,
              created_by_user_id: null, // System-created
            };
            actionsExecuted.push('create_task');
            break;
          }

          case 'assign_to': {
            const params = action.params as { user_id?: string; routing_rule?: string };
            if (params.user_id) {
              taskData.assignee_user_id = params.user_id;
            } else if (params.routing_rule === 'round_robin') {
              // Simple round-robin: get least assigned member
              const { data: members } = await supabase
                .from('workspace_members')
                .select('user_id')
                .eq('workspace_id', systemEvent.workspace_id)
                .in('role', ['admin', 'gestor', 'operador']);

              if (members && members.length > 0) {
                // Count current open tasks per member
                const { data: taskCounts } = await supabase
                  .from('tasks')
                  .select('assignee_user_id')
                  .eq('workspace_id', systemEvent.workspace_id)
                  .neq('status', 'done')
                  .not('assignee_user_id', 'is', null);

                const countMap: Record<string, number> = {};
                members.forEach(m => { countMap[m.user_id] = 0; });
                (taskCounts || []).forEach(t => {
                  if (t.assignee_user_id && countMap[t.assignee_user_id] !== undefined) {
                    countMap[t.assignee_user_id]++;
                  }
                });

                const leastBusy = Object.entries(countMap).sort((a, b) => a[1] - b[1])[0];
                if (leastBusy) {
                  taskData.assignee_user_id = leastBusy[0];
                }
              }
            }
            actionsExecuted.push('assign_to');
            break;
          }

          case 'set_due_in_hours': {
            const params = action.params as { hours: number };
            const dueAt = new Date();
            dueAt.setHours(dueAt.getHours() + (params.hours || 24));
            taskData.due_at = dueAt.toISOString();
            actionsExecuted.push('set_due_in_hours');
            break;
          }

          case 'set_due_at': {
            const params = action.params as { date: string };
            if (params.date) {
              taskData.due_at = params.date;
            }
            actionsExecuted.push('set_due_at');
            break;
          }

          case 'add_tag': {
            const params = action.params as { tag: string };
            if (params.tag) {
              const currentTags = (taskData.tags as string[]) || [];
              if (!currentTags.includes(params.tag)) {
                taskData.tags = [...currentTags, params.tag];
              }
            }
            actionsExecuted.push('add_tag');
            break;
          }
        }
      }

      // Create task if create_task action was present
      if (actionsExecuted.includes('create_task')) {
        const { data: newTask, error: taskError } = await supabase
          .from('tasks')
          .insert([taskData])
          .select('id')
          .single();

        if (taskError) {
          console.error('Error creating task:', taskError);
        } else {
          taskId = newTask?.id;

          // Process post-task-creation actions
          for (const action of rule.actions) {
            if (action.type === 'add_checklist' && taskId) {
              const params = action.params as { items: string[] };
              if (params.items && params.items.length > 0) {
                const checklistItems = params.items.map((title, index) => ({
                  task_id: taskId,
                  title,
                  sort_order: index,
                  is_done: false,
                }));
                await supabase.from('task_checklists').insert(checklistItems);
                actionsExecuted.push('add_checklist');
              }
            }

            if (action.type === 'notify' && taskId) {
              const notifyUsers: string[] = [];

              // Notify assignee
              if (taskData.assignee_user_id) {
                notifyUsers.push(taskData.assignee_user_id as string);
              }

              // Create notifications
              if (notifyUsers.length > 0) {
                const notifications = notifyUsers.map(userId => ({
                  workspace_id: systemEvent.workspace_id,
                  user_id: userId,
                  type: 'automation_created',
                  title: `Nova tarefa atribuída: ${taskData.title}`,
                  body: `Uma tarefa foi criada automaticamente pela regra "${rule.name}"`,
                  link: `/tarefas/${taskId}`,
                  is_read: false,
                }));
                await supabase.from('notifications').insert(notifications);
                actionsExecuted.push('notify');
              }
            }
          }

          // Log to audit
          await supabase.from('audit_logs').insert({
            workspace_id: systemEvent.workspace_id,
            user_id: null,
            entity_type: 'task',
            entity_id: taskId,
            action: 'automation_create',
            details: {
              rule_id: rule.id,
              rule_name: rule.name,
              event_id: systemEvent.id,
              actions_executed: actionsExecuted,
            },
          });
        }
      }

      results.push({ rule_id: rule.id, task_id: taskId, actions_executed: actionsExecuted });
    }

    // Mark event as processed
    await supabase
      .from('system_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event_id);

    return new Response(
      JSON.stringify({ success: true, event_id, rules_applied: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Automation processor error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Evaluate conditions against payload
function evaluateConditions(conditions: Record<string, unknown>, payload: Record<string, unknown>): boolean {
  if (!conditions || Object.keys(conditions).length === 0) {
    return true; // No conditions = always match
  }

  for (const [key, expected] of Object.entries(conditions)) {
    const actual = getNestedValue(payload, key);

    if (typeof expected === 'object' && expected !== null) {
      const op = expected as { op?: string; value?: unknown };
      if (op.op && op.value !== undefined) {
        switch (op.op) {
          case 'eq':
            if (actual !== op.value) return false;
            break;
          case 'neq':
            if (actual === op.value) return false;
            break;
          case 'gt':
            if (typeof actual !== 'number' || actual <= (op.value as number)) return false;
            break;
          case 'gte':
            if (typeof actual !== 'number' || actual < (op.value as number)) return false;
            break;
          case 'lt':
            if (typeof actual !== 'number' || actual >= (op.value as number)) return false;
            break;
          case 'lte':
            if (typeof actual !== 'number' || actual > (op.value as number)) return false;
            break;
          case 'contains':
            if (typeof actual !== 'string' || !actual.includes(op.value as string)) return false;
            break;
          case 'in':
            if (!Array.isArray(op.value) || !op.value.includes(actual)) return false;
            break;
        }
      }
    } else {
      // Simple equality check
      if (actual !== expected) return false;
    }
  }

  return true;
}

// Get nested value from object using dot notation
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((current, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

// Interpolate {{variable}} in string with payload values
function interpolateString(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    const value = getNestedValue(payload, path);
    return value !== undefined ? String(value) : '';
  });
}
