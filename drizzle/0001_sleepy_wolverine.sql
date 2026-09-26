CREATE TABLE `market_datasets` (
	`owner` text NOT NULL,
	`id` text NOT NULL,
	`symbol` text NOT NULL,
	`source` text NOT NULL,
	`basis` text NOT NULL,
	`price_column` text NOT NULL,
	`kind` text NOT NULL,
	`count` integer NOT NULL,
	`first_date` text NOT NULL,
	`last_date` text NOT NULL,
	`created` text NOT NULL,
	`observations` text NOT NULL,
	PRIMARY KEY(`owner`, `id`)
);
