import PageHeader from '@/components/PageHeader';

export default function RunDetailPage({ params }: { params: { runId: string } }) {
  return (
    <div>
      <PageHeader title="Run detail" subtitle={params.runId} />
      <div className="p-6 text-sm text-muted">Wiring up.</div>
    </div>
  );
}
