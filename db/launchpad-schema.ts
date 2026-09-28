import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { users, categories } from "./forum-schema";
export const wallets = sqliteTable("wallets", {
  address: text("address").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
});
export const walletChallenges = sqliteTable("wallet_challenges", {
  id: text("id").primaryKey(),
  address: text("address").notNull(),
  message: text("message").notNull(),
  userId: text("user_id"),
  expiresAt: integer("expires_at").notNull(),
});
export const walletSessions = sqliteTable("wallet_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  address: text("address").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});
export const launches = sqliteTable("launches", {
  id: text("id").primaryKey(),
  mint: text("mint").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  wallet: text("wallet").notNull(),
  name: text("name").notNull(),
  symbol: text("symbol").notNull(),
  description: text("description").notNull(),
  imageId: text("image_id").notNull(),
  minimum: text("minimum").notNull(),
  transaction: text("transaction").notNull(),
  message: text("message").notNull(),
  lastValidBlockHeight: integer("last_valid_block_height").notNull(),
  signature: text("signature"),
  status: text("status").notNull().default("prepared"),
  createdAt: integer("created_at").notNull(),
});
export const tokenRooms = sqliteTable(
  "token_rooms",
  {
    mint: text("mint").primaryKey(),
    category: text("category")
      .notNull()
      .unique()
      .references(() => categories.slug),
    launchId: text("launch_id")
      .notNull()
      .unique()
      .references(() => launches.id),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    symbol: text("symbol").notNull(),
    description: text("description").notNull(),
    imageId: text("image_id").notNull(),
    minimum: text("minimum").notNull(),
    decimals: integer("decimals").notNull().default(6),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_rooms_created").on(t.createdAt)],
);
