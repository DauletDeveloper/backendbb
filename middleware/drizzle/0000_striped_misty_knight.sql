CREATE TABLE "barber" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"owner_id" uuid,
	"description" text,
	"is_verified" boolean DEFAULT false,
	"total_clients" integer,
	"total_earned" integer,
	"working_days" text,
	"open_hour" text,
	"close_hour" text,
	"register_price" text,
	"location" text,
	"lat" numeric(9, 6),
	"lng" numeric(9, 6),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "contacts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"barber_id" uuid NOT NULL,
	"type" text NOT NULL,
	"value" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "favorites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notification_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text,
	"description" text,
	"to" uuid
);
--> statement-breakpoint
CREATE TABLE "photo_url" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "photo_url_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"url" text NOT NULL,
	"barber_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "rate_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_name" text,
	"rate" double precision NOT NULL,
	"description" text NOT NULL,
	"rater_id" uuid NOT NULL,
	"rated_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "register" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "register_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"date" timestamp NOT NULL,
	"time" time NOT NULL,
	"user_id" uuid NOT NULL,
	"barber_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"money_count" integer DEFAULT 0,
	"is_banned" boolean DEFAULT false,
	"banned_until" timestamp,
	"email" text NOT NULL,
	"is_verified" boolean DEFAULT false,
	"role" text DEFAULT 'user',
	"password" text NOT NULL,
	"mobile_number" text,
	"refresh_token" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "barber" ADD CONSTRAINT "barber_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_barber_id_barber_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_barber_id_barber_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_to_users_id_fk" FOREIGN KEY ("to") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_url" ADD CONSTRAINT "photo_url_barber_id_barber_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate" ADD CONSTRAINT "rate_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate" ADD CONSTRAINT "rate_rated_id_barber_id_fk" FOREIGN KEY ("rated_id") REFERENCES "public"."barber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register" ADD CONSTRAINT "register_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "register" ADD CONSTRAINT "register_barber_id_barber_id_fk" FOREIGN KEY ("barber_id") REFERENCES "public"."barber"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_barber_id_idx" ON "contacts" USING btree ("barber_id");