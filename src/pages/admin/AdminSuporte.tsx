/**
 * Admin Support Ticket Management
 * List, filter, and respond to all support tickets
 */

import { useState } from 'react';
import { AdminTicketList } from '@/components/admin/support/AdminTicketList';
import { AdminTicketDetail } from '@/components/admin/support/AdminTicketDetail';

export default function AdminSuporte() {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  if (selectedTicketId) {
    return (
      <AdminTicketDetail
        ticketId={selectedTicketId}
        onBack={() => setSelectedTicketId(null)}
      />
    );
  }

  return <AdminTicketList onSelectTicket={setSelectedTicketId} />;
}
