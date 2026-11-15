PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_savings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`cents` integer,
	`saved_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_finance_savings`("id", "name", "cents", "saved_cents", "currency", "created_at", "updated_at") SELECT "id", "name", "cents", "saved_cents", "currency", "created_at", "updated_at" FROM `finance_savings`;--> statement-breakpoint
DROP TABLE `finance_savings`;--> statement-breakpoint
ALTER TABLE `__new_finance_savings` RENAME TO `finance_savings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `finance_entries` ADD `saving_id` integer;