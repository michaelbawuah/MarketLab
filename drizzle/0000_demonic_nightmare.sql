CREATE TABLE `ledger` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`sequence` integer NOT NULL,
	`payload` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_owner_sequence` ON `ledger` (`owner`,`sequence`);--> statement-breakpoint
CREATE TABLE `prices` (
	`dataset` text NOT NULL,
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`close` text NOT NULL,
	PRIMARY KEY(`dataset`, `symbol`, `date`)
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`started` text NOT NULL,
	`status` text NOT NULL,
	`records` integer NOT NULL,
	`inserted` integer NOT NULL,
	`duration` integer NOT NULL,
	`message` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `runs_owner_started_id` ON `runs` (`owner`,`started`,`id`);