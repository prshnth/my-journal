import { getOwnerTodos, type TodoRow } from "@/lib/stats";
import { EmptyState } from "@/components/ui";
import { addTodoAction, deleteTodoAction, toggleTodoAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function TodosPage() {
  const data = await getOwnerTodos();

  if (!data.hasOwner) {
    return (
      <EmptyState
        title="no todos yet"
        body="send your bot /start, then add todos with /todos or the once-a-day braindump."
      />
    );
  }

  return (
    <div className="space-y-6">
      <form action={addTodoAction} className="flex gap-2">
        <input
          name="text"
          required
          placeholder="add a todo…"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none transition focus:border-zinc-600"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm transition hover:bg-zinc-700"
        >
          add
        </button>
      </form>

      {data.open.length === 0 && data.done.length === 0 ? (
        <EmptyState title="all clear" body="nothing on your list. add one above, or via /todos in Telegram." />
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              open · {data.open.length}
            </h2>
            {data.open.length === 0 ? (
              <p className="text-sm text-zinc-500">nothing open — nice.</p>
            ) : (
              <ul className="space-y-2">
                {data.open.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </ul>
            )}
          </section>

          {data.done.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">done</h2>
              <ul className="space-y-2">
                {data.done.map((t) => (
                  <TodoItem key={t.id} todo={t} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TodoItem({ todo }: { todo: TodoRow }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
      <form action={toggleTodoAction.bind(null, todo.id, !todo.done)} className="flex">
        <button
          type="submit"
          aria-label={todo.done ? "reopen" : "complete"}
          className={`grid h-5 w-5 place-items-center rounded-full border text-[11px] transition ${
            todo.done
              ? "border-emerald-600 bg-emerald-600 text-zinc-950"
              : "border-zinc-600 text-transparent hover:border-zinc-400"
          }`}
        >
          ✓
        </button>
      </form>
      <span className={`flex-1 text-sm ${todo.done ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
        {todo.text}
      </span>
      <form action={deleteTodoAction.bind(null, todo.id)} className="flex">
        <button type="submit" aria-label="delete" className="text-zinc-600 transition hover:text-red-400">
          ✕
        </button>
      </form>
    </li>
  );
}
