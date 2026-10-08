import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const projects = sqliteTable('projects', {
 id:text('id').primaryKey(), name:text('name').notNull(), brand:text('brand').notNull(), school:text('school').notNull(),
 goal:text('goal').notNull(), brief:text('brief').notNull(), sourceNote:text('source_note').notNull(), referenceBudget:integer('reference_budget'),
 revision:integer('revision').notNull().default(1), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull()
});
export const records = sqliteTable('records', {
 id:text('id').primaryKey(), projectId:text('project_id').notNull().references(()=>projects.id), type:text('type').notNull(), data:text('data').notNull(),
 revision:integer('revision').notNull().default(1), createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull()
}, table=>[index('idx_records_project_type').on(table.projectId,table.type)]);
