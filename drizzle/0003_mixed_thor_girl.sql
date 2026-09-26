CREATE TABLE `corporate_actions` (
	`owner` text NOT NULL,
	`dataset_id` text NOT NULL,
	`source` text NOT NULL,
	`events` text NOT NULL,
	`revision` integer NOT NULL,
	`updated` text NOT NULL,
	PRIMARY KEY(`owner`, `dataset_id`)
);
