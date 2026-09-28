CREATE TABLE `research_replay_receipts` (
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`receipt` text NOT NULL,
	PRIMARY KEY(`owner`, `run_id`)
);
