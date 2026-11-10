CREATE TABLE `links_bin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`description` text,
	`folder_id` integer,
	`folder_path` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `links_bin_deleted_idx` ON `links_bin` (`deleted_at`);--> statement-breakpoint
CREATE TABLE `notes_bin` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`folder_id` integer,
	`folder_path` text DEFAULT '' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notes_bin_deleted_idx` ON `notes_bin` (`deleted_at`);