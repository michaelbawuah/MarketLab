import { sqliteTable, text, integer, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
