import { relations } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uuid,
  index,
  numeric,
  doublePrecision,
  time,
  unique,
} from "drizzle-orm/pg-core";
 
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  isBanned: boolean("is_banned").default(false),
  bannedUntil: timestamp("banned_until"),
  email: text("email").notNull().unique(),
  isVerified: boolean("is_verified").default(false),
  role: text("role").default("user"),
  password: text("password").notNull(),
  mobileNumber: text("mobile_number"),
  refreshToken: text("refresh_token"),
  warnsCount: integer("warns_count").default(0),
  totalBanned: integer("total_banned").default(0),
  userCode: text("user_code"),
  triedTrial: boolean("tried_trial").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});
 
export const notification = pgTable("notification", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  title: text("title"),
  description: text("description"),
  isReaded: boolean("is_readed").default(false),
  to: uuid("to").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
});
 

export const barbershop = pgTable("barbershop", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
  description: text("description"),
  isVerified: boolean("is_verified").default(false),
  totalClients: integer("total_clients").default(0),
  rating: doublePrecision("rating").default(5.0),
  workingDays: text("working_days"),
  openHour: text("open_hour"),
  closeHour: text("close_hour"),
  barbersCount: integer("barbers_count").default(0),
  registerPrice: text("register_price"),
  location: text("location"),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  subscriptionStatus: text("subscription_status").default("trial").notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  subscriptionEndsAt: timestamp("subscription_ends_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const barber = pgTable("barber_profile", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  experienceInYears: integer("experience_in_years").notNull(),
  shopId: uuid("shop_id")
    .references(() => barbershop.id, { onDelete: "cascade" })
    .notNull(),
});
 
export const photoURL = pgTable("photo_url", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  url: text("url").notNull(),
  barberId: uuid("barber_id")
    .references(() => barbershop.id, { onDelete: "cascade" })
    .notNull(),
});
 

export const rating = pgTable("rate", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  rate: doublePrecision("rate").notNull(),
  description: text("description"),
  raterName: text("rater_name").notNull(),
  isReported: boolean("is_reported").default(false),
  reportedCount: integer("reported_count").default(0),
  raterId: uuid("rater_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  ratedId: uuid("rated_id")
    .references(() => barbershop.id, { onDelete: "cascade" })
    .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
});
 
export const register = pgTable("register", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  status: text("status").default("active"),
  date: timestamp("date").notNull(),
  isReported: boolean("is_reported").default(false),
  time: time("time").notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  barberId: uuid("barber_id")
    .references(() => barbershop.id, { onDelete: "cascade" })
    .notNull(),
    registerTo: integer("register_to").references(() => barber.id, { onDelete: "cascade" }).notNull(), 
});

 
export const favorites = pgTable(
  "favorites",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    barberId: uuid("barber_id")
      .references(() => barbershop.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userBarberUnique: unique("favorites_user_barber_unique").on(
      table.userId,
      table.barberId
    ),
  })
);

export const contacts = pgTable(
  "contacts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    barberId: uuid("barber_id")
      .references(() => barbershop.id, { onDelete: "cascade" })
      .notNull(),
    type: text("type").notNull(),
    value: text("value").notNull(),
    url: text("url"),
  },
  (table) => ({
    barberIdIdx: index("contacts_barber_id_idx").on(table.barberId),
  })
);
 

export const favoritesRelations = relations(favorites, ({ one }) => ({
  user: one(users, { fields: [favorites.userId], references: [users.id] }),
  barbershop: one(barbershop, {
    fields: [favorites.barberId],
    references: [barbershop.id],
  }),
}));
 
export const barbershopRelations = relations(barbershop, ({ one, many }) => ({
  owner: one(users, { fields: [barbershop.ownerId], references: [users.id] }),
  rates: many(rating),
  contacts: many(contacts),
  photos: many(photoURL),
  registers: many(register),
  barbers: many(barber),
}));
 
export const usersRelations = relations(users, ({ many }) => ({
  ownedBarbershops: many(barbershop),
  rates: many(rating),
  registers: many(register),
  favorites: many(favorites),
}));
 
export const ratingRelations = relations(rating, ({ one }) => ({
  user: one(users, { fields: [rating.raterId], references: [users.id] }),
  barbershop: one(barbershop, {
    fields: [rating.ratedId],
    references: [barbershop.id],
  }),
}));
 
export const registerRelations = relations(register, ({ one }) => ({
  user: one(users, { fields: [register.userId], references: [users.id] }),
  barbershop: one(barbershop, {
    fields: [register.barberId],
    references: [barbershop.id],
  }),
  barber: one(barber, { fields: [register.registerTo], references: [barber.id] }),
}));
 
export const contactsRelations = relations(contacts, ({ one }) => ({
  barbershop: one(barbershop, {
    fields: [contacts.barberId],
    references: [barbershop.id],
  }),
}));
 
export const photoURLRelations = relations(photoURL, ({ one }) => ({
  barbershop: one(barbershop, {
    fields: [photoURL.barberId],
    references: [barbershop.id],
  }),
}));
 

export const barberRelations = relations(barber, ({ one }) => ({
  shop: one(barbershop, {
    fields: [barber.shopId],
    references: [barbershop.id],
  }),
}));