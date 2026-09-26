CREATE TABLE `research_runs` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`created` text NOT NULL,
	`symbol` text NOT NULL,
	`benchmark` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`payload` text NOT NULL,
	`result` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
