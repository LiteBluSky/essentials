CREATE TABLE `assistant_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`app` text NOT NULL,
	`target` text NOT NULL,
	`op` text NOT NULL,
	`item_id` integer NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`before` text,
	`bin_ids` text,
	`created_at` integer NOT NULL,
	`undone_at` integer
);
--> statement-breakpoint
CREATE INDEX `assistant_changes_run_idx` ON `assistant_changes` (`run_id`);--> statement-breakpoint
ALTER TABLE `assistant_log` ADD `run_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `run_id` text;