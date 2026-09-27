CREATE TABLE `discussion_audit` (
	`sequence` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`share_revision` integer NOT NULL,
	`actor` text NOT NULL,
	`event` text NOT NULL,
	`entity_id` text NOT NULL,
	`created` text NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `discussion_audit_report` ON `discussion_audit` (`owner`,`run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `discussion_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`share_revision` integer NOT NULL,
	`author` text NOT NULL,
	`author_name` text NOT NULL,
	`body` text NOT NULL,
	`created` text NOT NULL,
	`removed_at` text,
	`removed_by` text
);
--> statement-breakpoint
CREATE INDEX `discussion_comments_report` ON `discussion_comments` (`owner`,`run_id`,`share_revision`,`created`);--> statement-breakpoint
CREATE TABLE `discussion_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`run_id` text NOT NULL,
	`share_revision` integer NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`created` text NOT NULL,
	`claimed_by` text,
	`claimed_name` text,
	`claimed_at` text,
	`revoked_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discussion_invites_token` ON `discussion_invites` (`token_hash`);--> statement-breakpoint
CREATE INDEX `discussion_invites_report` ON `discussion_invites` (`owner`,`run_id`,`share_revision`);
--> statement-breakpoint
CREATE TRIGGER discussion_invite_created AFTER INSERT ON discussion_invites BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,NEW.share_revision,NEW.owner,'invite_created',NEW.id,NEW.created,json_object('label',NEW.label));
END;
--> statement-breakpoint
CREATE TRIGGER discussion_invite_accepted AFTER UPDATE OF claimed_by ON discussion_invites WHEN OLD.claimed_by IS NULL AND NEW.claimed_by IS NOT NULL BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,NEW.share_revision,NEW.claimed_by,'invite_accepted',NEW.id,NEW.claimed_at,json_object('name',NEW.claimed_name));
END;
--> statement-breakpoint
CREATE TRIGGER discussion_invite_revoked AFTER UPDATE OF revoked_at ON discussion_invites WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,NEW.share_revision,NEW.owner,'invite_revoked',NEW.id,NEW.revoked_at,'{}');
END;
--> statement-breakpoint
CREATE TRIGGER discussion_comment_created AFTER INSERT ON discussion_comments BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,NEW.share_revision,NEW.author,'comment_created',NEW.id,NEW.created,json_object('name',NEW.author_name,'body',NEW.body));
END;
--> statement-breakpoint
CREATE TRIGGER discussion_comment_removed AFTER UPDATE OF removed_at ON discussion_comments WHEN OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,NEW.share_revision,NEW.removed_by,'comment_removed',NEW.id,NEW.removed_at,'{}');
END;
--> statement-breakpoint
CREATE TRIGGER discussion_share_changed AFTER UPDATE OF revision ON research_shares WHEN NEW.revision<>OLD.revision BEGIN
 INSERT INTO discussion_audit (owner,run_id,share_revision,actor,event,entity_id,created,detail)
 VALUES (NEW.owner,NEW.run_id,OLD.revision,NEW.owner,CASE WHEN NEW.revoked IS NULL THEN 'share_replaced' ELSE 'share_revoked' END,NEW.run_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'),json_object('nextRevision',NEW.revision));
END;
--> statement-breakpoint
CREATE TRIGGER discussion_audit_no_update BEFORE UPDATE ON discussion_audit BEGIN SELECT RAISE(ABORT,'Discussion audit is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER discussion_audit_no_delete BEFORE DELETE ON discussion_audit BEGIN SELECT RAISE(ABORT,'Discussion audit is append-only'); END;
