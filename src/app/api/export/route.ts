import { NextResponse, type NextRequest } from "next/server";
import { DateTime } from "luxon";
import { getJournalEntries, getOwnerTodos } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const asMarkdown = req.nextUrl.searchParams.get("format") === "md";
  const [journal, todos] = await Promise.all([
    getJournalEntries({ limit: 1_000_000 }),
    getOwnerTodos(),
  ]);
  const stamp = DateTime.now().toFormat("yyyy-LL-dd");

  if (asMarkdown) {
    const lines: string[] = ["# my journal", ""];
    for (const e of journal.entries) {
      const when = DateTime.fromISO(e.receivedAt)
        .setZone(journal.timezone)
        .toFormat("ccc, LLL d yyyy · HH:mm");
      lines.push(`## ${when}`);
      if (e.promptText) lines.push(`> ${e.promptText}`, "");
      lines.push(e.text, "");
      lines.push("---", "");
    }
    if (todos.open.length || todos.done.length) {
      lines.push("# todos", "");
      for (const t of todos.open) lines.push(`- [ ] ${t.text}`);
      for (const t of todos.done) lines.push(`- [x] ${t.text}`);
      lines.push("");
    }
    return new NextResponse(lines.join("\n"), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="my-journal-${stamp}.md"`,
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    timezone: journal.timezone,
    entries: journal.entries,
    todos: { open: todos.open, done: todos.done },
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="my-journal-${stamp}.json"`,
    },
  });
}
