"use server";

import { revalidatePath } from "next/cache";
import { addTodo, deleteTodo, setTodoDone } from "@/lib/repo";
import { getOwnerUserId } from "@/lib/stats";

export async function addTodoAction(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const userId = await getOwnerUserId();
  if (userId == null) return;
  await addTodo({ userId, text, source: "ui" });
  revalidatePath("/todos");
}

export async function toggleTodoAction(id: number, done: boolean): Promise<void> {
  await setTodoDone(id, done);
  revalidatePath("/todos");
}

export async function deleteTodoAction(id: number): Promise<void> {
  await deleteTodo(id);
  revalidatePath("/todos");
}
