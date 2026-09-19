import { TicketDetail } from '@/components/workbench';
export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetail id={id} />;
}
