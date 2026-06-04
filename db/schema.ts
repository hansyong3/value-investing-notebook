import { pgTable, serial, text, timestamp, date, integer, numeric, boolean } from "drizzle-orm/pg-core";

export const stocks = pgTable("stocks", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  content: text("content").notNull().default(""),
  starred: boolean("starred").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const noteImages = pgTable("note_images", {
  id: serial("id").primaryKey(),
  noteId: integer("note_id").notNull().references(() => notes.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const holdings = pgTable("holdings", {
  id: serial("id").primaryKey(),
  stockId: integer("stock_id").notNull().references(() => stocks.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "buy" | "sell"
  date: date("date").notNull(),
  shares: numeric("shares", { precision: 15, scale: 4 }).notNull(),
  price: numeric("price", { precision: 15, scale: 4 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  fee: numeric("fee", { precision: 15, scale: 4 }).default("0"),
  note: text("note").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
