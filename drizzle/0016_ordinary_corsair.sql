ALTER TABLE `finance_subscriptions` ADD `kind` text DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_subscriptions` ADD `interval` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_subscriptions` ADD `patterns` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `finance_subscriptions` ADD `weekend` text;--> statement-breakpoint
ALTER TABLE `finance_subscriptions` ADD `end_day` text;--> statement-breakpoint
ALTER TABLE `finance_subscriptions` ADD `end_after` integer;