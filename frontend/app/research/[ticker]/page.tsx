import PageHeader from '@/components/PageHeader';

export default function TickerResearchPage({ params }: { params: { ticker: string } }) {
  return (
    <div>
      <PageHeader title={decodeURIComponent(params.ticker)} subtitle="Research Terminal" />
      <div className="p-6 text-sm text-muted">Wiring up.</div>
    </div>
  );
}
