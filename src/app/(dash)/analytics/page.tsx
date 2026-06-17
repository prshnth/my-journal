import { getDashboardData } from "@/lib/stats";
import { MoodTrend, RunsBar, SleepTrend } from "@/components/Charts";
import { Heatmap } from "@/components/Heatmap";
import { Card, EmptyState, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const data = await getDashboardData();

  if (!data.hasOwner) {
    return (
      <EmptyState
        title="no data yet"
        body="send your bot /start and reply to a few check-ins — your trends show up here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="entries" value={String(data.totals.entries)} />
        <Stat label="day streak" value={String(data.totals.streak)} />
        <Stat label="runs · 7d" value={String(data.totals.runs7)} />
        <Stat
          label="avg mood · 7d"
          value={data.totals.avgMood7 === null ? "—" : data.totals.avgMood7.toFixed(1)}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card title="mood">
          <MoodTrend data={data.daily} />
        </Card>
        <Card title="sleep">
          <SleepTrend data={data.daily} />
        </Card>
        <Card title="runs">
          <RunsBar data={data.daily} />
        </Card>
      </section>

      <section>
        <Card title="consistency · last 18 weeks">
          <Heatmap days={data.calendar} />
        </Card>
      </section>
    </div>
  );
}
