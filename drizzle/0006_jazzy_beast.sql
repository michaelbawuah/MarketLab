CREATE TABLE `research_shares` (
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created` text NOT NULL,
	`expires` text NOT NULL,
	`revoked` text,
	`revision` integer NOT NULL,
	`report` text NOT NULL,
	`digest` text NOT NULL,
	PRIMARY KEY(`owner`, `run_id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_shares_token_hash` ON `research_shares` (`token_hash`);