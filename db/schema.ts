import { sqliteTable, text, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
export const planningWorkspaces = sqliteTable('planning_workspaces', {
 owner:text('owner').primaryKey(),revision:integer('revision').notNull(),updated:text('updated').notNull(),payload:text('payload').notNull(),
});
export const strategyLibrary = sqliteTable('strategy_library', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),created:text('created').notNull(),
 title:text('title').notNull(),report:text('report').notNull(),digest:text('digest').notNull(),
},t=>[uniqueIndex('strategy_library_owner_run').on(t.owner,t.runId)]);
export const peerContributions = sqliteTable('peer_contributions', {
 owner:text('owner').notNull(),period:text('period').notNull(),cohort:text('cohort').notNull(),returnPct:integer('return_bps').notNull(),created:text('created').notNull(),active:integer('active').notNull().default(1),
},t=>[primaryKey({columns:[t.owner,t.period]}),index('peer_contributions_cohort_period').on(t.cohort,t.period)]);
export const peerReleases = sqliteTable('peer_releases', {
 period:text('period').notNull(),cohort:text('cohort').notNull(),payload:text('payload').notNull(),created:text('created').notNull(),
},t=>[primaryKey({columns:[t.period,t.cohort]})]);
export const supportTickets = sqliteTable('support_tickets', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),subject:text('subject').notNull(),body:text('body').notNull(),created:text('created').notNull(),reply:text('reply'),replied:text('replied'),
},t=>[index('support_tickets_owner_created').on(t.owner,t.created)]);
export const ledger = sqliteTable('ledger', {owner:text('owner').notNull(),id:text('id').notNull(),sequence:integer('sequence').notNull(),payload:text('payload').notNull()},t=>[primaryKey({columns:[t.owner,t.id]}),uniqueIndex('ledger_owner_sequence').on(t.owner,t.sequence)]);
export const prices = sqliteTable('prices', {dataset:text('dataset').notNull(),symbol:text('symbol').notNull(),date:text('date').notNull(),close:text('close').notNull()},t=>[primaryKey({columns:[t.dataset,t.symbol,t.date]})]);
export const runs = sqliteTable('runs', {id:text('id').primaryKey(),owner:text('owner').notNull(),started:text('started').notNull(),status:text('status').notNull(),records:integer('records').notNull(),inserted:integer('inserted').notNull(),duration:integer('duration').notNull(),message:text('message').notNull()},t=>[uniqueIndex('runs_owner_started_id').on(t.owner,t.started,t.id)]);
export const marketDatasets = sqliteTable('market_datasets', {
 owner:text('owner').notNull(), id:text('id').notNull(), symbol:text('symbol').notNull(), source:text('source').notNull(),
 basis:text('basis').notNull(), priceColumn:text('price_column').notNull(), kind:text('kind').notNull(), count:integer('count').notNull(),
 firstDate:text('first_date').notNull(), lastDate:text('last_date').notNull(), created:text('created').notNull(), observations:text('observations').notNull(),
 origin:text('origin').notNull().default('csv'), providerRefreshed:text('provider_refreshed'), providerTimezone:text('provider_timezone'),
}, t=>[primaryKey({columns:[t.owner,t.id]})]);
export const providerRuns = sqliteTable('provider_runs', {
 id:text('id').primaryKey(), owner:text('owner').notNull(), symbol:text('symbol').notNull(), mode:text('mode').notNull(),
 started:text('started').notNull(), status:text('status').notNull(), records:integer('records').notNull(), datasetId:text('dataset_id'), message:text('message').notNull(),
}, t=>[uniqueIndex('provider_runs_owner_started_id').on(t.owner,t.started,t.id)]);
export const corporateActions = sqliteTable('corporate_actions', {
 owner:text('owner').notNull(), datasetId:text('dataset_id').notNull(), source:text('source').notNull(), events:text('events').notNull(),
 revision:integer('revision').notNull(), updated:text('updated').notNull(),
}, t=>[primaryKey({columns:[t.owner,t.datasetId]})]);
export const historicalPortfolios = sqliteTable('historical_portfolios', {
 owner:text('owner').primaryKey(), revision:integer('revision').notNull(), fingerprint:text('fingerprint').notNull(), updated:text('updated').notNull(), payload:text('payload').notNull(),
});
export const researchRuns = sqliteTable('research_runs', {
 owner:text('owner').notNull(), id:text('id').notNull(), name:text('name').notNull(), created:text('created').notNull(),
 symbol:text('symbol').notNull(), benchmark:text('benchmark').notNull(), start:text('start').notNull(), end:text('end').notNull(),
 payload:text('payload').notNull(), result:text('result').notNull(),
}, t=>[primaryKey({columns:[t.owner,t.id]})]);
export const researchShares = sqliteTable('research_shares', {
 owner:text('owner').notNull(),runId:text('run_id').notNull(),tokenHash:text('token_hash').notNull(),
 created:text('created').notNull(),expires:text('expires').notNull(),revoked:text('revoked'),revision:integer('revision').notNull(),
 report:text('report').notNull(),digest:text('digest').notNull(),
},t=>[primaryKey({columns:[t.owner,t.runId]}),uniqueIndex('research_shares_token_hash').on(t.tokenHash)]);
export const researchReplayReceipts = sqliteTable('research_replay_receipts', {
 owner:text('owner').notNull(),runId:text('run_id').notNull(),receipt:text('receipt').notNull(),
},t=>[primaryKey({columns:[t.owner,t.runId]})]);
export const discussionInvites = sqliteTable('discussion_invites', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),shareRevision:integer('share_revision').notNull(),
 tokenHash:text('token_hash').notNull(),label:text('label').notNull(),created:text('created').notNull(),
 claimedBy:text('claimed_by'),claimedName:text('claimed_name'),claimedAt:text('claimed_at'),revokedAt:text('revoked_at'),
},t=>[uniqueIndex('discussion_invites_token').on(t.tokenHash),index('discussion_invites_report').on(t.owner,t.runId,t.shareRevision)]);
export const discussionComments = sqliteTable('discussion_comments', {
 id:text('id').primaryKey(),owner:text('owner').notNull(),runId:text('run_id').notNull(),shareRevision:integer('share_revision').notNull(),
 author:text('author').notNull(),authorName:text('author_name').notNull(),body:text('body').notNull(),created:text('created').notNull(),
 removedAt:text('removed_at'),removedBy:text('removed_by'),
},t=>[index('discussion_comments_report').on(t.owner,t.runId,t.shareRevision,t.created)]);
export const discussionAudit = sqliteTable('discussion_audit', {
 sequence:integer('sequence').primaryKey({autoIncrement:true}),owner:text('owner').notNull(),runId:text('run_id').notNull(),
 shareRevision:integer('share_revision').notNull(),actor:text('actor').notNull(),event:text('event').notNull(),
 entityId:text('entity_id').notNull(),created:text('created').notNull(),detail:text('detail').notNull(),
},t=>[index('discussion_audit_report').on(t.owner,t.runId,t.sequence)]);
