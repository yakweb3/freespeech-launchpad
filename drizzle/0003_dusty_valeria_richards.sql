CREATE TABLE `launches` (
	`id` text PRIMARY KEY NOT NULL,
	`mint` text NOT NULL,
	`user_id` text NOT NULL,
	`wallet` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`description` text NOT NULL,
	`image_id` text NOT NULL,
	`minimum` text NOT NULL,
	`transaction` text NOT NULL,
	`message` text NOT NULL,
	`last_valid_block_height` integer NOT NULL,
	`signature` text,
	`status` text DEFAULT 'prepared' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `launches_mint_unique` ON `launches` (`mint`);--> statement-breakpoint
CREATE TABLE `token_rooms` (
	`mint` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`launch_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`name` text NOT NULL,
	`symbol` text NOT NULL,
	`description` text NOT NULL,
	`image_id` text NOT NULL,
	`minimum` text NOT NULL,
	`decimals` integer DEFAULT 6 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category`) REFERENCES `categories`(`slug`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`launch_id`) REFERENCES `launches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `token_rooms_category_unique` ON `token_rooms` (`category`);--> statement-breakpoint
CREATE UNIQUE INDEX `token_rooms_launch_id_unique` ON `token_rooms` (`launch_id`);--> statement-breakpoint
CREATE INDEX `idx_rooms_created` ON `token_rooms` (`created_at`);--> statement-breakpoint
CREATE TABLE `wallet_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`message` text NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wallet_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wallets` (
	`address` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
