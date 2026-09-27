import {
  bigint,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const reportUploads = pgTable("report_uploads", {
  id: serial("id").primaryKey(),
  telegramUserId: bigint("telegram_user_id", { mode: "number" }),
  originalFileName: text("original_file_name").notNull(),
  status: text("status").notNull().default("uploaded"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
