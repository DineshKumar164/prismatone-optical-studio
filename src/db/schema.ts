import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const opticalPresets = pgTable('optical_presets', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  name: text('name').notNull(),
  description: text('description').notNull(),
  cameraId: text('camera_id').notNull(),
  lensId: text('lens_id').notNull(),
  parametersJson: text('parameters_json').notNull(),
  isSystem: boolean('is_system').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  name: text('name').notNull(),
  mediaType: text('media_type').notNull(),
  codec: text('codec').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  fps: integer('fps').notNull(),
  durationSec: text('duration_sec').notNull(),
  s3Key: text('s3_key').notNull(),
  storageBucket: text('storage_bucket').notNull(),
  fileSizeBytes: integer('file_size_bytes').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const renderJobs = pgTable('render_jobs', {
  id: serial('id').primaryKey(),
  userUid: text('user_uid'),
  projectTitle: text('project_title').notNull(),
  sourceName: text('source_name').notNull(),
  cameraId: text('camera_id').notNull(),
  lensId: text('lens_id').notNull(),
  qualityMode: text('quality_mode').notNull(),
  renderBackend: text('render_backend').notNull(),
  resolution: text('resolution').notNull(),
  totalFrames: integer('total_frames').notNull(),
  processedFrames: integer('processed_frames').notNull(),
  avgFrameMs: text('avg_frame_ms').notNull(),
  status: text('status').notNull(),
  s3ExportKey: text('s3_export_key'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  presets: many(opticalPresets),
  mediaAssets: many(mediaAssets),
  renderJobs: many(renderJobs),
}));
