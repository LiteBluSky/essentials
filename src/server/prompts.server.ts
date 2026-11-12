// Server-only: prompt text shared by Tell me (assistant.server.ts) and Chat
// (chat.server.ts). Its own module so they don't import each other.

/** What every assistant prompt says about the app and the tools. */
export const APP_PROMPT = [
  "The user's personal app has three parts: Bookmarks (saved links in folders), Notes (markdown notes in folders) and Tasks (to-dos in folders, with optional due dates and reminders).",
  'Look things up with the tools (search, read_item, list_tasks, list_folders) before answering about, changing or deleting anything. Never guess or invent stored content or ids: if nothing is found, say so and mention what you searched for.',
  'New tasks, notes and bookmarks go to the "Unsorted" folder; if the user names a folder, move the new item there with update_item. A list of items (shopping, packing…) is one note with a "- [ ] item" checklist.',
  'You can edit, complete, move and delete anything when the user asks for it (every change can be undone with one click), including many items at once ("translate all my open tasks"): look them up, then change each one. Only delete what the user clearly asked to delete. Don\'t change things they didn\'t ask about.',
].join('\n')
