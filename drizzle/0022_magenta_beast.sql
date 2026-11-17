CREATE TABLE `password_folders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`parent_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `password_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `password_folders_parent_idx` ON `password_folders` (`parent_id`);--> statement-breakpoint
CREATE TABLE `password_vault` (
	`id` integer PRIMARY KEY NOT NULL,
	`salt` text NOT NULL,
	`kdf` text NOT NULL,
	`check` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passwords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text DEFAULT '' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`secret` text NOT NULL,
	`folder_id` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `password_folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `passwords_folder_idx` ON `passwords` (`folder_id`);