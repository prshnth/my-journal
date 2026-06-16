"use client";

import type { ReactElement } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/lib/stats";

const fmtDate = (d: string) => d.slice(5); // MM-DD

const tooltipStyle = {
  background: "#18181b",
  border: "1px solid #3f3f46",
  borderRadius: 8,
  color: "#fafafa",
  fontSize: 12,
};

function Frame({ children }: { children: ReactElement }) {
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function MoodTrend({ data }: { data: DailyPoint[] }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#71717a" fontSize={12} />
        <YAxis domain={[-2, 2]} ticks={[-2, -1, 0, 1, 2]} stroke="#71717a" fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="mood" stroke="#34d399" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </Frame>
  );
}

export function SleepTrend({ data }: { data: DailyPoint[] }) {
  return (
    <Frame>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#71717a" fontSize={12} />
        <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} stroke="#71717a" fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="sleep" stroke="#60a5fa" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </Frame>
  );
}

export function RunsBar({ data }: { data: DailyPoint[] }) {
  return (
    <Frame>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tickFormatter={fmtDate} stroke="#71717a" fontSize={12} />
        <YAxis allowDecimals={false} stroke="#71717a" fontSize={12} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="runs" fill="#f59e0b" radius={[3, 3, 0, 0]} />
      </BarChart>
    </Frame>
  );
}
