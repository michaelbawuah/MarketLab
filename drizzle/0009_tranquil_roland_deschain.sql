CREATE TABLE `peer_contributions` (
	`owner` text NOT NULL,
	`period` text NOT NULL,
	`cohort` text NOT NULL,
	`return_bps` integer NOT NULL,
	`created` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`owner`, `period`)
);
--> statement-breakpoint
CREATE INDEX `peer_contributions_cohort_period` ON `peer_contributions` (`cohort`,`period`);--> statement-breakpoint
CREATE TABLE `peer_releases` (
	`period` text NOT NULL,
	`cohort` text NOT NULL,
	`payload` text NOT NULL,
	`created` text NOT NULL,
	PRIMARY KEY(`period`, `cohort`)
);
--> statement-breakpoint
CREATE TABLE `planning_workspaces` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`updated` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `strategy_library` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`created` text NOT NULL,
	`title` text NOT NULL,
	`report` text NOT NULL,
	`digest` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strategy_library_owner_run` ON `strategy_library` (`owner`,`run_id`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	`reply` text,
	`replied` text
);
--> statement-breakpoint
CREATE INDEX `support_tickets_owner_created` ON `support_tickets` (`owner`,`created`);