CREATE TABLE `provider_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`symbol` text NOT NULL,
	`mode` text NOT NULL,
	`started` text NOT NULL,
	`status` text NOT NULL,
	`records` integer NOT NULL,
	`dataset_id` text,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_runs_owner_started_id` ON `provider_runs` (`owner`,`started`,`id`);--> statement-breakpoint
ALTER TABLE `market_datasets` ADD `origin` text DEFAULT 'csv' NOT NULL;--> statement-breakpoint
ALTER TABLE `market_datasets` ADD `provider_refreshed` text;--> statement-breakpoint
ALTER TABLE `market_datasets` ADD `provider_timezone` text;