ALTER TABLE `tasks` ADD `due_at` integer;--> statement-breakpoint
ALTER TABLE `tasks` ADD `reminded_at` integer;--> statement-breakpoint
CREATE INDEX `tasks_due_idx` ON `tasks` (`due_at`);