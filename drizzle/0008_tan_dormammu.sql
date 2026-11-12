CREATE TABLE `assistant_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`provider` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`ok` integer NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`cost_usd` real,
	`duration_ms` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assistant_log_created_idx` ON `assistant_log` (`created_at`);