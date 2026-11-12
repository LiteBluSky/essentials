import { and, asc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import {
  folders as bookmarkFolders,
  contactFolders,
  contacts,
  links,
  noteFolders,
  notes,
  taskFolders,
  tasks,
} from '@/db/schema'
import { UNSORTED_FOLDER } from '@/lib/assistant'
import type { AssistantResult, ChangeSummary } from '@/lib/assistant'
import { linkInput } from '@/lib/bookmarks/schemas'
import { contactInput } from '@/lib/contacts/schemas'
import { REFERENCE_TYPES, formatReference } from '@/lib/references'
import { noteInput } from '@/lib/notes/schemas'
import { MAX_REMIND_MINUTES, taskInput } from '@/lib/tasks/schemas'
import { DEFAULT_DUE_HOUR, remindLabel } from '@/lib/tasks/tree'
import { ACTION_TOOLS, toAction } from './assistant.server'
import { runAction } from './assistant-actions.server'
import * as bookmarksDb from './bookmarks.server'
import * as contactsDb from './contacts.server'
import {
  deleteFolderRecorded,
  deleteItemRecorded,
  getFolder,
  getItem,
  itemLabel,
  recordCreate,
  recordUpdate,
} from './changes.server'
import type { App } from './changes.server'
import { zonedTime } from './llm.server'
import type { ToolDef } from './llm.server'
import * as notesDb from './notes.server'
import { search } from './search.server'
import * as tasksDb from './tasks.server'

// Server-only: every tool the assistant has (Tell me and Chat), and running
// them. Look-ups read; actions create / open; edits change or delete what
// exists, each recorded under the run so it can be undone
// (changes.server.ts).

/** Caps on what a tool hands back, so a long note can't flood the model. */
const MAX_BODY_CHARS = 20_000

const APPS = ['bookmarks', 'notes', 'tasks', 'contacts'] as const
const appArg = z.enum(APPS)
const id = z.number().int().positive()

export const LOOKUP_TOOLS: Array<ToolDef> = [
  {
    name: 'search',
    description:
      "Search the user's bookmarks (links), notes, tasks and contacts, and their folders. Every word must appear in the title, URL, description, note text, task description or a contact's name / phone / email / address / known from / context, so use one or two distinctive words and try other words or synonyms if nothing comes back. An empty query lists the most recently edited. Returns ids to use with the other tools.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'One or two keywords.' },
        app: {
          type: 'string',
          enum: APPS,
          description: 'Only look in this app. Omit to search all of them.',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'read_item',
    description:
      'Read one bookmark, note, task or contact in full (note text, task description and dates, link URL and description, contact details), by its id.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        id: { type: 'integer' },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_tasks',
    description:
      "List tasks by status and due date, e.g. what is open, overdue, due this week, or done. Dates are the user's local days (YYYY-MM-DD). Tasks without a due date are listed only when no date range is given.",
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['open', 'done', 'all'],
          description: 'Default: open.',
        },
        due_from: {
          type: 'string',
          description: 'First local day (inclusive), YYYY-MM-DD.',
        },
        due_to: {
          type: 'string',
          description: 'Last local day (inclusive), YYYY-MM-DD.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_folders',
    description:
      "List an app's folders with their ids and paths (for moving things or creating subfolders).",
    parameters: {
      type: 'object',
      properties: { app: { type: 'string', enum: APPS } },
      required: ['app'],
      additionalProperties: false,
    },
  },
]

export const EDIT_TOOLS: Array<ToolDef> = [
  {
    name: 'update_item',
    description:
      'Change an existing bookmark, note, task or contact: give only the fields to change. Tasks: title, description, due, remind_minutes_before, done. Notes: title, text. Bookmarks: title, url, description, favorite. Contacts: title (their name), phone, email, address, known_from, description (context). Any of them: folder_id to move it (null = top level).',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        id: { type: 'integer' },
        title: { type: 'string' },
        text: {
          type: 'string',
          description: "A note's full new text (markdown). Replaces it.",
        },
        description: {
          type: 'string',
          description:
            "A task's or bookmark's description, or a contact's context ('' clears it).",
        },
        phone: { type: 'string', description: "A contact's phone number." },
        email: { type: 'string', description: "A contact's email address." },
        address: { type: 'string', description: "A contact's address." },
        known_from: {
          type: 'string',
          description: 'Where the user knows the contact from.',
        },
        url: { type: 'string', description: "A bookmark's URL." },
        due: {
          type: ['string', 'null'],
          description:
            "A task's due date in the user's local time, YYYY-MM-DDTHH:mm or YYYY-MM-DD; null removes it.",
        },
        remind_minutes_before: {
          type: ['integer', 'null'],
          description:
            'Minutes before the due time to remind (0 = at the due time); null = no reminder.',
        },
        done: {
          type: 'boolean',
          description: 'Tasks: true completes it, false reopens it.',
        },
        favorite: {
          type: 'boolean',
          description: 'Bookmarks: add to / remove from the favourites.',
        },
        folder_id: {
          type: ['integer', 'null'],
          description:
            'Move it into this folder (list_folders); null = top level.',
        },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_item',
    description:
      'Delete a bookmark, note, task or contact. Only when the user asked to delete it.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        id: { type: 'integer' },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_folder',
    description:
      'Create a folder in an app (inside parent_id, or at the top level).',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        name: { type: 'string' },
        parent_id: { type: ['integer', 'null'] },
      },
      required: ['app', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_folder',
    description:
      'Rename a folder and/or move it (parent_id: the new parent folder, null = top level).',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        id: { type: 'integer' },
        name: { type: 'string' },
        parent_id: { type: ['integer', 'null'] },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'delete_folder',
    description:
      'Delete a folder with everything in it (subfolders and items). Only when the user asked to delete that folder.',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: APPS },
        id: { type: 'integer' },
      },
      required: ['app', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_bookmark',
    description:
      'Save a link (bookmark). It goes to the "Unsorted" folder unless folder_id is given.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        title: { type: 'string', description: 'Optional; else the site name.' },
        description: { type: 'string' },
        folder_id: { type: ['integer', 'null'] },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_contact',
    description:
      'Save a person as a contact. It goes to the "Unsorted" folder unless folder_id is given. Only fill in what the user said.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string' },
        address: { type: 'string' },
        known_from: {
          type: 'string',
          description: 'Where the user knows them from (work, school…).',
        },
        description: {
          type: 'string',
          description: 'Anything else worth remembering about them.',
        },
        folder_id: { type: ['integer', 'null'] },
      },
      required: ['name'],
      additionalProperties: false,
    },
  },
]

/** Every tool, for the Chat and Tell me loops. */
export const ALL_TOOLS = [...LOOKUP_TOOLS, ...ACTION_TOOLS, ...EDIT_TOOLS]

const searchArgs = z.object({
  query: z.string().max(200).default(''),
  app: appArg.optional(),
})
const appIdArgs = z.object({ app: appArg, id })
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const listArgs = z.object({
  status: z.enum(['open', 'done', 'all']).default('open'),
  due_from: day.optional(),
  due_to: day.optional(),
})
const updateArgs = z.object({
  app: appArg,
  id,
  title: z.string().optional(),
  text: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  due: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?/)
    .nullable()
    .optional(),
  remind_minutes_before: z
    .number()
    .int()
    .min(0)
    .max(MAX_REMIND_MINUTES)
    .nullable()
    .optional(),
  done: z.boolean().optional(),
  favorite: z.boolean().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  known_from: z.string().optional(),
  folder_id: id.nullable().optional(),
})
const createFolderArgs = z.object({
  app: appArg,
  name: z.string().trim().min(1).max(255),
  parent_id: id.nullable().optional(),
})
const updateFolderArgs = z.object({
  app: appArg,
  id,
  name: z.string().trim().min(1).max(255).optional(),
  parent_id: id.nullable().optional(),
})
const bookmarkArgs = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  folder_id: id.nullable().optional(),
})

const contactArgs = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  known_from: z.string().optional(),
  description: z.string().optional(),
  folder_id: id.nullable().optional(),
})

const FOLDER_TABLES = {
  bookmarks: bookmarkFolders,
  notes: noteFolders,
  tasks: taskFolders,
  contacts: contactFolders,
}

/** Every folder of an app with its path ("A / B"). */
async function folderList(app: App) {
  const table = FOLDER_TABLES[app]
  const rows = await db
    .select({ id: table.id, name: table.name, parentId: table.parentId })
    .from(table)
  const byId = new Map(rows.map((r) => [r.id, r]))
  const path = (folderId: number | null) => {
    const names: Array<string> = []
    let current = folderId
    while (current !== null && names.length < 50) {
      const folder = byId.get(current)
      if (!folder) break
      names.unshift(folder.name)
      current = folder.parentId
    }
    return names.join(' / ')
  }
  return { rows, path }
}

/** "2026-11-13 15:00" in the user's timezone. */
function local(date: Date | null, timeZone: string) {
  if (!date) return null
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

async function readItem(app: App, itemId: number, timeZone: string) {
  const { path } = await folderList(app)
  if (app === 'notes') {
    const note = (await db.select().from(notes).where(eq(notes.id, itemId))).at(
      0,
    )
    if (!note) return { error: 'No note with that id' }
    return {
      app,
      id: itemId,
      title: note.title,
      folder: path(note.folderId),
      folder_id: note.folderId,
      text:
        note.body.length > MAX_BODY_CHARS
          ? `${note.body.slice(0, MAX_BODY_CHARS)}… (cut short)`
          : note.body,
      edited: local(note.updatedAt, timeZone),
    }
  }
  if (app === 'tasks') {
    const task = (await db.select().from(tasks).where(eq(tasks.id, itemId))).at(
      0,
    )
    if (!task) return { error: 'No task with that id' }
    return {
      app,
      id: itemId,
      title: task.title,
      folder: path(task.folderId),
      folder_id: task.folderId,
      description: task.description,
      created: local(task.createdAt, timeZone),
      due: local(task.dueAt, timeZone),
      reminder: task.dueAt ? remindLabel(task.remindMinutes) : null,
      done: local(task.completedAt, timeZone),
    }
  }
  if (app === 'contacts') {
    const contact = (
      await db.select().from(contacts).where(eq(contacts.id, itemId))
    ).at(0)
    if (!contact) return { error: 'No contact with that id' }
    return {
      app,
      id: itemId,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      address: contact.address,
      known_from: contact.knownFrom,
      context: contact.description,
      folder: path(contact.folderId),
      folder_id: contact.folderId,
    }
  }
  const link = (await db.select().from(links).where(eq(links.id, itemId))).at(0)
  if (!link) return { error: 'No bookmark with that id' }
  return {
    app,
    id: itemId,
    title: link.title,
    url: link.url,
    description: link.description ?? '',
    folder: path(link.folderId),
    folder_id: link.folderId,
    favorite: link.favoritePosition !== null,
  }
}

async function listTasks(
  { status, due_from, due_to }: z.infer<typeof listArgs>,
  timeZone: string,
) {
  const { path } = await folderList('tasks')
  const rows = await db
    .select()
    .from(tasks)
    .where(
      and(
        status === 'open'
          ? isNull(tasks.completedAt)
          : status === 'done'
            ? isNotNull(tasks.completedAt)
            : undefined,
        due_from
          ? gte(tasks.dueAt, zonedTime(due_from, timeZone, 0))
          : undefined,
        due_to
          ? lt(
              tasks.dueAt,
              new Date(zonedTime(due_to, timeZone, 0).getTime() + 86_400_000),
            )
          : undefined,
      ),
    )
    .orderBy(asc(tasks.dueAt), asc(tasks.createdAt))
    .limit(200)
  return rows.map((task) => ({
    id: task.id,
    title: task.title,
    folder: path(task.folderId),
    due: local(task.dueAt, timeZone),
    done: task.completedAt !== null,
    created: local(task.createdAt, timeZone),
  }))
}

/** What a run needs to carry out tools: where results go, its id (for
 * recording changes) and the user's timezone. */
export type RunContext = {
  runId: string
  timeZone: string
  result: AssistantResult
}

/** The `@type(Name#id)` reference to an item, for the model to write into
 * text it creates or edits. */
function refFor(app: App, label: string, itemId: number) {
  const type = REFERENCE_TYPES.find((t) => t.app === app)!.type
  return formatReference(type, label, itemId)
}

function changed(
  ctx: RunContext,
  summary: ChangeSummary,
): { changed: ChangeSummary; ref?: string } {
  ctx.result.changed.push(summary)
  return summary.target === 'item' && summary.op !== 'delete'
    ? { changed: summary, ref: refFor(summary.app, summary.label, summary.id) }
    : { changed: summary }
}

async function updateItem(
  args: z.infer<typeof updateArgs>,
  ctx: RunContext,
): Promise<unknown> {
  const { app, id: itemId } = args
  const before = await getItem(app, itemId)
  if (!before) return { error: `No ${app} item with that id` }
  const folderId =
    args.folder_id === undefined
      ? (before.folderId as number | null)
      : args.folder_id
  const details: Array<string> = []
  if (args.title !== undefined && args.title !== (before.title ?? before.name))
    details.push('renamed')
  if (folderId !== before.folderId) {
    const { path } = await folderList(app)
    details.push(`moved to ${path(folderId) || 'the top level'}`)
  }

  if (app === 'tasks') {
    const task = before as unknown as typeof tasks.$inferSelect
    const dueAt =
      args.due === undefined
        ? task.dueAt
        : args.due === null
          ? null
          : zonedTime(args.due, ctx.timeZone, DEFAULT_DUE_HOUR)
    const input = taskInput.parse({
      title: args.title ?? task.title,
      description: args.description ?? task.description,
      folderId,
      dueAt,
      remindMinutes:
        args.remind_minutes_before === undefined
          ? task.remindMinutes
          : args.remind_minutes_before,
    })
    if (args.description !== undefined) details.push('description changed')
    if (args.due !== undefined) {
      details.push(args.due === null ? 'due date removed' : 'due date changed')
    }
    if (args.remind_minutes_before !== undefined)
      details.push('reminder changed')
    await tasksDb.editTask(itemId, input)
    if (args.done !== undefined && args.done !== (task.completedAt !== null)) {
      await tasksDb.setCompleted({ id: itemId, done: args.done })
      details.push(args.done ? 'completed' : 'reopened')
    }
  } else if (app === 'contacts') {
    const contact = before as unknown as typeof contacts.$inferSelect
    const input = contactInput.parse({
      name: args.title ?? contact.name,
      phone: args.phone ?? contact.phone,
      email: args.email ?? contact.email,
      address: args.address ?? contact.address,
      knownFrom: args.known_from ?? contact.knownFrom,
      description: args.description ?? contact.description,
      folderId,
    })
    for (const [key, label] of [
      ['phone', 'phone'],
      ['email', 'email'],
      ['address', 'address'],
      ['known_from', 'known from'],
      ['description', 'context'],
    ] as const) {
      if (args[key] !== undefined) details.push(`${label} changed`)
    }
    await contactsDb.editContact(itemId, input)
  } else if (app === 'notes') {
    const note = before as unknown as typeof notes.$inferSelect
    const input = noteInput.parse({
      title: args.title ?? note.title,
      body: args.text ?? note.body,
      folderId,
    })
    if (args.text !== undefined) details.push('text changed')
    await notesDb.editNote(itemId, input)
  } else {
    const link = before as unknown as typeof links.$inferSelect
    const input = linkInput.parse({
      title: args.title ?? link.title,
      url: args.url ?? link.url,
      description: args.description ?? link.description ?? '',
      folderId,
    })
    if (args.url !== undefined) details.push('URL changed')
    if (args.description !== undefined) details.push('description changed')
    await bookmarksDb.editLink(itemId, input)
    if (
      args.favorite !== undefined &&
      args.favorite !== (link.favoritePosition !== null)
    ) {
      await bookmarksDb.setFavorite({ id: itemId, favorite: args.favorite })
      details.push(args.favorite ? 'made a favourite' : 'no longer a favourite')
    }
  }

  const after = await getItem(app, itemId)
  const summary = {
    app,
    target: 'item' as const,
    id: itemId,
    label: itemLabel(after ?? before),
  }
  await recordUpdate(ctx.runId, summary, before)
  return changed(ctx, {
    ...summary,
    op: 'update',
    detail: details.join(', ') || 'updated',
  })
}

const REMOVE_ITEM: Record<App, (id: number) => Promise<void>> = {
  bookmarks: bookmarksDb.removeLink,
  notes: notesDb.removeNote,
  tasks: tasksDb.removeTask,
  contacts: contactsDb.removeContact,
}
const REMOVE_FOLDER: Record<App, (id: number) => Promise<void>> = {
  bookmarks: bookmarksDb.removeFolder,
  notes: notesDb.removeFolder,
  tasks: tasksDb.removeFolder,
  contacts: contactsDb.removeFolder,
}
const INSERT_FOLDER: Record<
  App,
  (input: { name: string; parentId: number | null }) => Promise<{ id: number }>
> = {
  bookmarks: bookmarksDb.insertFolder,
  notes: notesDb.insertFolder,
  tasks: tasksDb.insertFolder,
  contacts: contactsDb.insertFolder,
}
const EDIT_FOLDER: Record<
  App,
  (
    id: number,
    input: { name: string; parentId: number | null },
  ) => Promise<void>
> = {
  bookmarks: bookmarksDb.editFolder,
  notes: notesDb.editFolder,
  tasks: tasksDb.editFolder,
  contacts: contactsDb.editFolder,
}

/** Runs one tool call; returns what goes back to the model (JSON). */
export async function runTool(
  name: string,
  args: unknown,
  ctx: RunContext,
): Promise<unknown> {
  const bad = { error: `Bad arguments for ${name}` }
  switch (name) {
    case 'search': {
      const parsed = searchArgs.safeParse(args)
      if (!parsed.success) return bad
      const found = await search(parsed.data.query)
      const apps = parsed.data.app ? [parsed.data.app] : APPS
      return Object.fromEntries(
        apps.map((app) => [
          app,
          found[app].map((r) =>
            r.kind === 'item' ? { ...r, ref: refFor(app, r.label, r.id) } : r,
          ),
        ]),
      )
    }
    case 'read_item': {
      const parsed = appIdArgs.safeParse(args)
      if (!parsed.success) return bad
      const { app, id: itemId } = parsed.data
      const item = await readItem(app, itemId, ctx.timeZone)
      const row = 'error' in item ? null : await getItem(app, itemId)
      return row ? { ...item, ref: refFor(app, itemLabel(row), itemId) } : item
    }
    case 'list_tasks': {
      const parsed = listArgs.safeParse(args ?? {})
      return parsed.success ? listTasks(parsed.data, ctx.timeZone) : bad
    }
    case 'list_folders': {
      const parsed = z.object({ app: appArg }).safeParse(args)
      if (!parsed.success) return bad
      const { rows, path } = await folderList(parsed.data.app)
      return rows.map((row) => ({ id: row.id, path: path(row.id) }))
    }
    case 'update_item': {
      const parsed = updateArgs.safeParse(args)
      return parsed.success ? updateItem(parsed.data, ctx) : bad
    }
    case 'delete_item': {
      const parsed = appIdArgs.safeParse(args)
      if (!parsed.success) return bad
      const { app, id: itemId } = parsed.data
      const label = await deleteItemRecorded(ctx.runId, app, itemId, () =>
        REMOVE_ITEM[app](itemId),
      )
      return changed(ctx, {
        app,
        target: 'item',
        op: 'delete',
        id: itemId,
        label,
      })
    }
    case 'create_folder': {
      const parsed = createFolderArgs.safeParse(args)
      if (!parsed.success) return bad
      const { app, name: folderName, parent_id } = parsed.data
      const { id: folderId } = await INSERT_FOLDER[app]({
        name: folderName,
        parentId: parent_id ?? null,
      })
      const summary = {
        app,
        target: 'folder' as const,
        id: folderId,
        label: folderName,
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, { ...summary, op: 'create' })
    }
    case 'update_folder': {
      const parsed = updateFolderArgs.safeParse(args)
      if (!parsed.success) return bad
      const { app, id: folderId, name: folderName, parent_id } = parsed.data
      const before = await getFolder(app, folderId)
      if (!before) return { error: 'No folder with that id' }
      const parentId =
        parent_id === undefined ? (before.parentId as number | null) : parent_id
      await EDIT_FOLDER[app](folderId, {
        name: folderName ?? String(before.name),
        parentId,
      })
      const summary = {
        app,
        target: 'folder' as const,
        id: folderId,
        label: folderName ?? String(before.name),
      }
      await recordUpdate(ctx.runId, summary, before)
      const details = [
        folderName && folderName !== before.name ? 'renamed' : '',
        parentId !== before.parentId ? 'moved' : '',
      ].filter(Boolean)
      return changed(ctx, {
        ...summary,
        op: 'update',
        detail: details.join(', ') || 'updated',
      })
    }
    case 'delete_folder': {
      const parsed = appIdArgs.safeParse(args)
      if (!parsed.success) return bad
      const { app, id: folderId } = parsed.data
      const removed = await deleteFolderRecorded(ctx.runId, app, folderId, () =>
        REMOVE_FOLDER[app](folderId),
      )
      return changed(ctx, {
        app,
        target: 'folder',
        op: 'delete',
        id: folderId,
        label: removed.label,
        detail: `with ${removed.items} item${removed.items === 1 ? '' : 's'}`,
      })
    }
    case 'create_bookmark': {
      const parsed = bookmarkArgs.safeParse(args)
      if (!parsed.success) return bad
      const folderId =
        parsed.data.folder_id ?? (await ensureBookmarksUnsorted())
      const input = linkInput.parse({
        title: parsed.data.title ?? '',
        url: /^https?:\/\//i.test(parsed.data.url)
          ? parsed.data.url
          : `https://${parsed.data.url}`,
        description: parsed.data.description ?? '',
        folderId,
      })
      const { id: linkId } = await bookmarksDb.insertLink(input)
      const row = await getItem('bookmarks', linkId)
      const summary = {
        app: 'bookmarks' as const,
        target: 'item' as const,
        id: linkId,
        label: row ? itemLabel(row) : input.url,
      }
      await recordCreate(ctx.runId, summary)
      return changed(ctx, { ...summary, op: 'create' })
    }
  }

  if (name === 'create_contact') {
    const parsed = contactArgs.safeParse(args)
    if (!parsed.success) return bad
    const input = contactInput.safeParse({
      name: parsed.data.name,
      phone: parsed.data.phone ?? '',
      email: parsed.data.email ?? '',
      address: parsed.data.address ?? '',
      knownFrom: parsed.data.known_from ?? '',
      description: parsed.data.description ?? '',
      folderId:
        parsed.data.folder_id ??
        (await contactsDb.ensureTopFolder(UNSORTED_FOLDER)),
    })
    if (!input.success) return { error: input.error.issues[0].message }
    const { id: contactId } = await contactsDb.insertContact(input.data)
    const summary = {
      app: 'contacts' as const,
      target: 'item' as const,
      id: contactId,
      label: input.data.name,
    }
    await recordCreate(ctx.runId, summary)
    return changed(ctx, { ...summary, op: 'create' })
  }

  // create_task / create_note / open_item (the Tell me tools).
  const action = toAction({ id: '', name, args })
  if (!action) return { error: `Unknown tool or bad arguments: ${name}` }
  const done = await runAction(action, ctx.timeZone, ctx.result)
  if ('query' in done) {
    return done.match
      ? {
          shown_to_user: true,
          match: {
            app: done.match.app,
            id: done.match.id,
            title: done.match.label,
          },
        }
      : { error: 'Nothing matched', query: done.query }
  }
  await recordCreate(ctx.runId, {
    app: done.app,
    target: 'item',
    id: done.id,
    label: done.title.split('\n')[0].slice(0, 80),
  })
  return {
    created: { app: done.app, id: done.id, title: done.title },
    ref: refFor(done.app, done.title.split('\n')[0].slice(0, 80), done.id),
  }
}

/** The bookmarks' top-level "Unsorted" folder, created if needed. */
async function ensureBookmarksUnsorted() {
  const existing = (await folderList('bookmarks')).rows.find(
    (f) =>
      f.parentId === null &&
      f.name.toLowerCase() === UNSORTED_FOLDER.toLowerCase(),
  )
  if (existing) return existing.id
  return (
    await bookmarksDb.insertFolder({ name: UNSORTED_FOLDER, parentId: null })
  ).id
}
