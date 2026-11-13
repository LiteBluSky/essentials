CREATE TABLE `finance_pending` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subscription_id` integer NOT NULL,
	`kind` text NOT NULL,
	`cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'subscriptions' NOT NULL,
	`day` text NOT NULL,
	`notified_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_pending_subscription_day_idx` ON `finance_pending` (`subscription_id`,`day`);