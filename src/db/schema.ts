import { relations } from 'drizzle-orm'
import {
  foreignKey,
  index,
  integer,
  real,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core'

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
}

// Each app (bookmarks, notes, …) has its own folder tree and items. The
// bookmark tables keep their original names (`folders`, `links`) so existing
// databases carry over; later apps prefix theirs (`note_folders`, `notes`).

// ---- Bookmarks ------------------------------------------------------------

// A folder can nest inside another folder. parentId = null means root level.
// The foreign keys document the shape; SQLite doesn't enforce them here (see
// removeFolder for the cascade).
export const folders = sqliteTable(
  'folders',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    parentId: integer('parent_id'),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete(
      'cascade',
    ),
    index('folders_parent_idx').on(t.parentId),
  ],
)

// A link lives in a folder, or at root level when folderId = null.
export const links = sqliteTable(
  'links',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    url: text().notNull(),
    description: text(),
    folderId: integer('folder_id').references(() => folders.id, {
      onDelete: 'cascade',
    }),
    position: integer().notNull().default(0),
    // Set when the link is a favourite; orders the favourites (shortcut
    // 1-9 = their rank by this). null = not a favourite.
    favoritePosition: integer('favorite_position'),
    ...timestamps,
  },
  (t) => [index('links_folder_idx').on(t.folderId)],
)

// Deleted links, kept for a day (BIN_TTL_MS) so they can be restored. A copy
// of the row, plus where it was: restoring puts it back in folderId (or the
// top level if that folder is gone too). folderPath is for display only.
export const linksBin = sqliteTable(
  'links_bin',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    url: text().notNull(),
    description: text(),
    folderId: integer('folder_id'),
    folderPath: text('folder_path').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('links_bin_deleted_idx').on(t.deletedAt)],
)

export const foldersRelations = relations(folders, ({ one, many }) => ({
  parent: one(folders, {
    fields: [folders.parentId],
    references: [folders.id],
    relationName: 'folder_parent',
  }),
  children: many(folders, { relationName: 'folder_parent' }),
  links: many(links),
}))

export const linksRelations = relations(links, ({ one }) => ({
  folder: one(folders, { fields: [links.folderId], references: [folders.id] }),
}))

// ---- Notes ----------------------------------------------------------------

// Same shape as the bookmark folders.
export const noteFolders = sqliteTable(
  'note_folders',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    parentId: integer('parent_id'),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete(
      'cascade',
    ),
    index('note_folders_parent_idx').on(t.parentId),
  ],
)

// A note lives in a folder, or at root level when folderId = null. The title
// is optional (empty = show a snippet of the body); the body is markdown.
export const notes = sqliteTable(
  'notes',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull().default(''),
    body: text().notNull().default(''),
    folderId: integer('folder_id').references(() => noteFolders.id, {
      onDelete: 'cascade',
    }),
    position: integer().notNull().default(0),
    // Bumped each time the note is opened: drive "Recent" and "Most viewed".
    viewCount: integer('view_count').notNull().default(0),
    openedAt: integer('opened_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [index('notes_folder_idx').on(t.folderId)],
)

// Deleted notes, kept for a day, like linksBin.
export const notesBin = sqliteTable(
  'notes_bin',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull().default(''),
    body: text().notNull().default(''),
    folderId: integer('folder_id'),
    folderPath: text('folder_path').notNull().default(''),
    viewCount: integer('view_count').notNull().default(0),
    openedAt: integer('opened_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => [index('notes_bin_deleted_idx').on(t.deletedAt)],
)

export const noteFoldersRelations = relations(noteFolders, ({ one, many }) => ({
  parent: one(noteFolders, {
    fields: [noteFolders.parentId],
    references: [noteFolders.id],
    relationName: 'note_folder_parent',
  }),
  children: many(noteFolders, { relationName: 'note_folder_parent' }),
  notes: many(notes),
}))

export const notesRelations = relations(notes, ({ one }) => ({
  folder: one(noteFolders, {
    fields: [notes.folderId],
    references: [noteFolders.id],
  }),
}))

// ---- Tasks ----------------------------------------------------------------

// Same shape as the bookmark folders.
export const taskFolders = sqliteTable(
  'task_folders',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    parentId: integer('parent_id'),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete(
      'cascade',
    ),
    index('task_folders_parent_idx').on(t.parentId),
  ],
)

// A task lives in a folder, or at root level when folderId = null. Its age
// (from createdAt) colours it, or its due date when it has one; completedAt
// set = done. A due task is pushed to the phone (ntfy) once, remindMinutes
// before dueAt, then remindedAt is set (cleared again when either changes).
export const tasks = sqliteTable(
  'tasks',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull(),
    description: text().notNull().default(''),
    folderId: integer('folder_id').references(() => taskFolders.id, {
      onDelete: 'cascade',
    }),
    position: integer().notNull().default(0),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    dueAt: integer('due_at', { mode: 'timestamp' }),
    // How many minutes before dueAt the reminder goes out (0 = at the due
    // time, null = no reminder).
    remindMinutes: integer('remind_minutes').default(0),
    remindedAt: integer('reminded_at', { mode: 'timestamp' }),
    ...timestamps,
  },
  (t) => [
    index('tasks_folder_idx').on(t.folderId),
    index('tasks_due_idx').on(t.dueAt),
  ],
)

export const taskFoldersRelations = relations(taskFolders, ({ one, many }) => ({
  parent: one(taskFolders, {
    fields: [taskFolders.parentId],
    references: [taskFolders.id],
    relationName: 'task_folder_parent',
  }),
  children: many(taskFolders, { relationName: 'task_folder_parent' }),
  tasks: many(tasks),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  folder: one(taskFolders, {
    fields: [tasks.folderId],
    references: [taskFolders.id],
  }),
}))

// ---- Contacts -------------------------------------------------------------

// Same shape as the bookmark folders.
export const contactFolders = sqliteTable(
  'contact_folders',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    parentId: integer('parent_id'),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [
    foreignKey({ columns: [t.parentId], foreignColumns: [t.id] }).onDelete(
      'cascade',
    ),
    index('contact_folders_parent_idx').on(t.parentId),
  ],
)

// A person: name plus optional phone, email, address, where the owner knows
// them from (`knownFrom`), birthday (`MM-DD` or `YYYY-MM-DD`) and free-text
// context (`description`); '' = none. `birthdayRemindedYear`: the year its
// birthday was last pushed (once a year). Lives in a folder, or at root
// level when folderId = null.
export const contacts = sqliteTable(
  'contacts',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    name: text().notNull(),
    phone: text().notNull().default(''),
    email: text().notNull().default(''),
    address: text().notNull().default(''),
    knownFrom: text('known_from').notNull().default(''),
    birthday: text().notNull().default(''),
    birthdayRemindedYear: integer('birthday_reminded_year'),
    description: text().notNull().default(''),
    folderId: integer('folder_id').references(() => contactFolders.id, {
      onDelete: 'cascade',
    }),
    position: integer().notNull().default(0),
    ...timestamps,
  },
  (t) => [index('contacts_folder_idx').on(t.folderId)],
)

export const contactFoldersRelations = relations(
  contactFolders,
  ({ one, many }) => ({
    parent: one(contactFolders, {
      fields: [contactFolders.parentId],
      references: [contactFolders.id],
      relationName: 'contact_folder_parent',
    }),
    children: many(contactFolders, { relationName: 'contact_folder_parent' }),
    contacts: many(contacts),
  }),
)

export const contactsRelations = relations(contacts, ({ one }) => ({
  folder: one(contactFolders, {
    fields: [contacts.folderId],
    references: [contactFolders.id],
  }),
}))

// Every app's folders share a shape, so one type serves them all.
export type Folder = typeof folders.$inferSelect
export type NewFolder = typeof folders.$inferInsert
export type Link = typeof links.$inferSelect
export type NewLink = typeof links.$inferInsert
export type BinnedLink = typeof linksBin.$inferSelect
export type Note = typeof notes.$inferSelect
export type NewNote = typeof notes.$inferInsert
export type BinnedNote = typeof notesBin.$inferSelect
export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type Contact = typeof contacts.$inferSelect
export type NewContact = typeof contacts.$inferInsert

// ---- Assistant history ------------------------------------------------------

// Every "Tell me…" request: what was said, what came of it, and what the LLM
// call cost (tokens; dollars when known). Shown in the assistant history.
export const assistantLog = sqliteTable(
  'assistant_log',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    text: text().notNull(),
    /** Where it came from: 'tell' (the Tell me field) or 'chat'. */
    source: text().notNull().default('tell'),
    provider: text().notNull().default(''),
    model: text().notNull().default(''),
    ok: integer({ mode: 'boolean' }).notNull(),
    /** What happened, one line per item ("Task: …", "Opened: …"), or the
     * error. */
    result: text().notNull().default(''),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    costUsd: real('cost_usd'),
    durationMs: integer('duration_ms').notNull().default(0),
    /** Its changes (assistant_changes), if it made any: they can be undone. */
    runId: text('run_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('assistant_log_created_idx').on(t.createdAt)],
)

// Every change the assistant makes (Tell me or Chat), grouped by run (one
// request / chat turn), with what was there before, so a run can be undone:
// a created thing is deleted, an edit put back, a deletion restored (with
// its original ids; the Bin copies it made, `binIds`, are removed).
export const assistantChanges = sqliteTable(
  'assistant_changes',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    runId: text('run_id').notNull(),
    app: text({
      enum: [
        'bookmarks',
        'notes',
        'tasks',
        'contacts',
        'calendar',
        'finances',
        'subscriptions',
      ],
    }).notNull(),
    target: text({ enum: ['item', 'folder'] }).notNull(),
    op: text({ enum: ['create', 'update', 'delete'] }).notNull(),
    itemId: integer('item_id').notNull(),
    /** What it is called, for messages ("Renamed task …"). */
    label: text().notNull().default(''),
    /** JSON: the row before (update), or every row deleted (delete). */
    before: text(),
    /** JSON: ids of the Bin rows the deletion made. */
    binIds: text('bin_ids'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    undoneAt: integer('undone_at', { mode: 'timestamp' }),
  },
  (t) => [index('assistant_changes_run_idx').on(t.runId)],
)

// ---- Chat -------------------------------------------------------------------

// The Chat app's saved conversations. The title is the start of the first
// message; updatedAt orders the list (latest first).
export const chatConversations = sqliteTable('chat_conversations', {
  id: integer().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  ...timestamps,
})

// A conversation's messages in order. An assistant message keeps what it
// did (`actions`: JSON of the tasks / notes created and items found) so the
// chat can show them with Open buttons; `error` marks a failed turn (its
// content is the error).
export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: text({ enum: ['user', 'assistant'] }).notNull(),
    content: text().notNull(),
    actions: text(),
    error: integer({ mode: 'boolean' }).notNull().default(false),
    /** The turn's changes (assistant_changes), for its Undo button. */
    runId: text('run_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('chat_messages_conversation_idx').on(t.conversationId)],
)

// ---- Settings ---------------------------------------------------------------

// App settings edited in the UI (Settings… in the ⋮ menu): the assistant's
// LLM key and the ntfy reminder target. One row per key (see SETTINGS in
// src/lib/settings.ts); a missing row falls back to the env var of the same
// name.
export const settings = sqliteTable('settings', {
  key: text().primaryKey(),
  value: text().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
})
export type AssistantLogEntry = typeof assistantLog.$inferSelect
export type ChatConversation = typeof chatConversations.$inferSelect
export type ChatMessage = typeof chatMessages.$inferSelect
export type AssistantChange = typeof assistantChanges.$inferSelect

// ---- Calendar -------------------------------------------------------------

// A coloured strip over one day or a range of days (`startDay`..`endDay`,
// inclusive, local `YYYY-MM-DD`: no times, no timezone). The title is
// optional ('' = none); `color` is a key of `CALENDAR_COLORS`. No folders.
// A reminder is pushed the day before it starts (`remindedDay` = the
// `startDay` it was pushed for, so moving the strip re-arms it).
export const calendarEvents = sqliteTable(
  'calendar_events',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    title: text().notNull().default(''),
    color: text().notNull(),
    startDay: text('start_day').notNull(),
    endDay: text('end_day').notNull(),
    remindedDay: text('reminded_day'),
    ...timestamps,
  },
  (t) => [index('calendar_events_start_idx').on(t.startDay)],
)

export type CalendarEvent = typeof calendarEvents.$inferSelect

// Remote libSQL databases (Turso, or a self-hosted sqld) the data can be
// switched to in Settings. Read only from the local file (with `settings`
// and the `ACTIVE_DATABASE` key): migrations create the table in every
// database, but it stays empty in remote ones. `authToken` '' = none.
export const databases = sqliteTable('databases', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  url: text().notNull(),
  authToken: text('auth_token').notNull().default(''),
  ...timestamps,
})

export type DatabaseSource = typeof databases.$inferSelect

// ---- Finances -------------------------------------------------------------

// Money in and out this month (and any later days), in whole cents per
// currency (no conversion). `category` is a key of `CATEGORIES`
// (`uncategorized` until picked or set by the AI); `day` a local
// `YYYY-MM-DD`; `subscriptionId` marks a subscription's charge. Once a month
// is over its entries are folded into `finance_months` and deleted.
export const financeEntries = sqliteTable(
  'finance_entries',
  {
    id: integer().primaryKey({ autoIncrement: true }),
    kind: text({ enum: ['expense', 'income'] }).notNull(),
    cents: integer().notNull(),
    currency: text().notNull().default('EUR'),
    title: text().notNull().default(''),
    category: text().notNull().default('uncategorized'),
    day: text().notNull(),
    subscriptionId: integer('subscription_id'),
    ...timestamps,
  },
  (t) => [index('finance_entries_day_idx').on(t.day)],
)

// A past month's report: what went in / out per category and currency.
export const financeMonths = sqliteTable(
  'finance_months',
  {
    month: text().notNull(),
    kind: text({ enum: ['expense', 'income'] }).notNull(),
    category: text().notNull(),
    currency: text().notNull(),
    cents: integer().notNull(),
    count: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.month, t.kind, t.category, t.currency] })],
)

// Charged automatically (an expense entry) on `startDay` and then the same
// day every month / year; `chargedDay` is the last charge.
export const financeSubscriptions = sqliteTable('finance_subscriptions', {
  id: integer().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  cents: integer().notNull(),
  currency: text().notNull().default('EUR'),
  category: text().notNull().default('subscriptions'),
  every: text({ enum: ['month', 'year'] })
    .notNull()
    .default('month'),
  startDay: text('start_day').notNull(),
  chargedDay: text('charged_day'),
  ...timestamps,
})

// Optional monthly budget per expense category, in euros.
export const financeBudgets = sqliteTable('finance_budgets', {
  category: text().primaryKey(),
  cents: integer().notNull(),
})

export type FinanceEntry = typeof financeEntries.$inferSelect
export type FinanceMonth = typeof financeMonths.$inferSelect
export type FinanceSubscription = typeof financeSubscriptions.$inferSelect
export type FinanceBudget = typeof financeBudgets.$inferSelect
