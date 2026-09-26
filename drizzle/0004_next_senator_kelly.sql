CREATE TABLE `historical_portfolios` (
	`owner` text PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`updated` text NOT NULL,
	`payload` text NOT NULL
);
