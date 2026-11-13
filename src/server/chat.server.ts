import { asc, desc, eq, inArray, lt } from 'drizzle-orm'

import { db } from '@/db'
import { chatConversations, chatMessages } from '@/db/schema'
import { chatCutoff } from '@/lib/chat'
import type { ChatInput, ChatTurnResult } from '@/lib/chat'
import { runAgent } from './agent.server'
import type { AgentRun } from './agent.server'
import { APP_PROMPT } from './prompts.server'
import { describe } from './assistant-actions.server'
import { logRequest } from './assistant-log.server'
import { undoableRuns } from './changes.server'
import { currentModel, localTime } from './llm.server'
import type { Turn } from './llm.server'

// Server-only: the Chat app. Each message runs the assistant's tool loop
// (agent.server.ts) with the conversation so far; it can look things up,
// create, edit and delete (all undoable per turn). Conversations and
// messages are saved; every turn is logged in the assistant history with its
// cost. Only import from chat.functions.ts.

/** Earlier messages sent along for context. */
const HISTORY_MESSAGES = 30

function systemPrompt(now: string, timeZone: string) {
  return [
    "You are the assistant inside the user's personal app, in a chat.",
    APP_PROMPT,
    'Read an item before quoting or summarising it.',
    `The user's local time is ${localTime(new Date(now), timeZone)} (day/month/year, ${timeZone}). Use it for "today", "this week", "overdue" and for due dates.`,
    "Answer briefly, in the user's language, in markdown. When you mention a stored item, give its title (and folder if it helps). After changing things, say what you changed.",
  ].join('\n')
}

/** The saved messages of a conversation, oldest first, each with whether
 * its changes can still be undone. */
export async function loadMessages(conversationId: number) {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, conversationId))
    .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
  const undoable = await undoableRuns(rows.map((m) => m.runId))
  return rows.map((m) => ({
    ...m,
    undoable: m.runId !== null && undoable.has(m.runId),
  }))
}

// Conversations idle for `CHAT_TTL_DAYS` go, messages first (no cascades).
async function purgeOldConversations() {
  const old = await db
    .select({ id: chatConversations.id })
    .from(chatConversations)
    .where(lt(chatConversations.updatedAt, chatCutoff()))
  if (old.length === 0) return
  const ids = old.map((c) => c.id)
  await db.transaction(async (tx) => {
    await tx
      .delete(chatMessages)
      .where(inArray(chatMessages.conversationId, ids))
    await tx.delete(chatConversations).where(inArray(chatConversations.id, ids))
  })
}

export async function listConversations() {
  await purgeOldConversations()
  return db
    .select()
    .from(chatConversations)
    .orderBy(desc(chatConversations.updatedAt), desc(chatConversations.id))
}

export async function removeConversation(id: number) {
  await db.transaction(async (tx) => {
    await tx.delete(chatMessages).where(eq(chatMessages.conversationId, id))
    await tx.delete(chatConversations).where(eq(chatConversations.id, id))
  })
}

/** The conversation's title: the start of its first message. */
function titleFrom(text: string) {
  const line = text.trim().split('\n')[0]
  return line.length > 60 ? `${line.slice(0, 57)}…` : line
}

/** A history line for a turn's changes. */
function changesLine(changed: ChatTurnResult['result']['changed']) {
  return changed
    .map(
      (c) =>
        `${c.op === 'delete' ? 'Deleted' : c.op === 'create' ? 'Created' : 'Changed'}: ${c.label}`,
    )
    .join('\n')
}

/**
 * Saves a turn: the user's message and the run's answer (or its error) with
 * what it created / found / changed and its run id, starting a conversation
 * when `conversationId` is null. Also used by Ask Jarvis, so every request
 * can be seen (and carried on) in Chat.
 */
export async function saveTurn(
  conversationId: number | null,
  text: string,
  run: AgentRun,
) {
  if (conversationId === null) {
    const [row] = await db
      .insert(chatConversations)
      .values({ title: titleFrom(text) })
      .returning({ id: chatConversations.id })
    conversationId = row.id
  }
  await db
    .insert(chatMessages)
    .values({ conversationId, role: 'user', content: text })

  const { result, error } = run
  const answer = run.answer || describe(result) || 'Done.'
  const runId = result.runId ?? null
  const hasActions =
    result.created.length || result.found.length || result.changed.length
  const [message] = await db
    .insert(chatMessages)
    .values({
      conversationId,
      role: 'assistant',
      content: error ?? answer,
      actions: hasActions ? JSON.stringify(result) : null,
      error: error !== null,
      runId,
    })
    .returning()
  await db
    .update(chatConversations)
    .set({ updatedAt: new Date() })
    .where(eq(chatConversations.id, conversationId))
  return { message }
}

/**
 * Sends a message: saves it (starting a conversation if needed), runs the
 * tool loop and saves the answer (or the error) with what was created /
 * found / changed and the run id for Undo. Every turn is logged with its
 * cost.
 */
export async function sendMessage(input: ChatInput): Promise<ChatTurnResult> {
  const started = Date.now()

  let conversationId = input.conversationId
  if (conversationId !== null) {
    const exists = (
      await db
        .select({ id: chatConversations.id })
        .from(chatConversations)
        .where(eq(chatConversations.id, conversationId))
    ).at(0)
    if (!exists) throw new Error('Conversation not found')
  }

  const earlier =
    conversationId === null
      ? []
      : (await loadMessages(conversationId))
          .filter((m) => !m.error)
          .slice(-HISTORY_MESSAGES)
  const turns: Array<Turn> = [
    ...earlier.map((m): Turn =>
      m.role === 'user'
        ? { role: 'user', text: m.content }
        : { role: 'assistant', text: m.content, calls: [] },
    ),
    { role: 'user', text: input.text },
  ]

  // Throws only when there's no API key: nothing is saved then.
  const run = await runAgent({
    system: systemPrompt(input.now, input.timeZone),
    turns,
    timeZone: input.timeZone,
    webSearch: input.webSearch,
  })

  const { message } = await saveTurn(conversationId, input.text, run)
  conversationId = message.conversationId
  const { result, error } = run
  const done = describe(result)
  const answer = run.answer || done || 'Done.'
  const runId = result.runId ?? null

  const model = run.usage ?? (await currentModel())
  await logRequest({
    text: input.text,
    source: 'chat',
    provider: model?.provider ?? '',
    model: model?.model ?? '',
    inputTokens: run.usage?.inputTokens ?? null,
    outputTokens: run.usage?.outputTokens ?? null,
    costUsd: run.usage?.costUsd ?? null,
    ok: error === null,
    result: [error ?? answer.slice(0, 300), done, changesLine(result.changed)]
      .filter(Boolean)
      .join('\n'),
    durationMs: Date.now() - started,
    runId,
  })

  return {
    conversationId,
    message: { ...message, undoable: runId !== null },
    result,
  }
}
