CREATE TABLE `finance_budgets` (
	`category` text PRIMARY KEY NOT NULL,
	`cents` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `finance_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'uncategorized' NOT NULL,
	`day` text NOT NULL,
	`subscription_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `finance_entries_day_idx` ON `finance_entries` (`day`);--> statement-breakpoint
CREATE TABLE `finance_months` (
	`month` text NOT NULL,
	`kind` text NOT NULL,
	`category` text NOT NULL,
	`currency` text NOT NULL,
	`cents` integer NOT NULL,
	`count` integer NOT NULL,
	PRIMARY KEY(`month`, `kind`, `category`, `currency`)
);
--> statement-breakpoint
CREATE TABLE `finance_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`category` text DEFAULT 'subscriptions' NOT NULL,
	`every` text DEFAULT 'month' NOT NULL,
	`start_day` text NOT NULL,
	`charged_day` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `calendar_events` ADD `reminded_day` text;