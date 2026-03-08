import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { enqueueEmailEvent } from '../_shared/email-trigger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { type, ticket_id } = await req.json();
    if (!type || !ticket_id) {
      return new Response(JSON.stringify({ error: 'Missing type or ticket_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('id, subject, user_id, workspace_id, category, description')
      .eq('id', ticket_id)
      .single();

    if (ticketError || !ticket) {
      return new Response(JSON.stringify({ error: 'Ticket not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch ticket owner's email
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', ticket.user_id)
      .single();

    const sellerEmail = ownerProfile?.email || '';
    const sellerName = ownerProfile?.full_name || 'Seller';
    const ticketRef = `#${ticket.id.slice(0, 8)}`;

    if (type === 'opened') {
      // 1) Email to admin
      const adminEmails = (Deno.env.get('ADMIN_EMAILS') || '').split(',').map(e => e.trim()).filter(Boolean);
      for (const adminEmail of adminEmails) {
        await enqueueEmailEvent(supabaseUrl, serviceRoleKey, {
          event_key: 'support_ticket_opened_admin',
          user_id: ticket.user_id,
          to_email: adminEmail,
          variables: {
            ticket_ref: ticketRef,
            subject: ticket.subject,
            category: ticket.category || 'Outro',
            description: (ticket.description || '').slice(0, 300),
            seller_name: sellerName,
            seller_email: sellerEmail,
          },
          dedup_key: `support_opened_admin_${ticket.id}`,
        });
      }

      // 2) Confirmation email to seller
      if (sellerEmail) {
        await enqueueEmailEvent(supabaseUrl, serviceRoleKey, {
          event_key: 'support_ticket_opened_seller',
          user_id: ticket.user_id,
          to_email: sellerEmail,
          variables: {
            ticket_ref: ticketRef,
            subject: ticket.subject,
            seller_name: sellerName,
          },
          dedup_key: `support_opened_seller_${ticket.id}`,
        });
      }
    } else if (type === 'reply') {
      // Email to seller about admin reply
      if (sellerEmail) {
        // Fetch latest support message
        const { data: latestMsg } = await supabase
          .from('support_messages')
          .select('content')
          .eq('ticket_id', ticket.id)
          .eq('sender_type', 'support')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        await enqueueEmailEvent(supabaseUrl, serviceRoleKey, {
          event_key: 'support_ticket_reply_seller',
          user_id: ticket.user_id,
          to_email: sellerEmail,
          variables: {
            ticket_ref: ticketRef,
            subject: ticket.subject,
            seller_name: sellerName,
            reply_preview: (latestMsg?.content || '').slice(0, 300),
          },
          dedup_key: `support_reply_${ticket.id}_${Date.now()}`,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[support-notify] Error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
