CREATE TYPE "public"."account_status" AS ENUM('active', 'expiring_soon', 'disconnected', 'rate_limited');--> statement-breakpoint
CREATE TYPE "public"."adapter_mode" AS ENUM('live', 'mock');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('instagram', 'facebook', 'tiktok', 'x', 'threads');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_daily_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"metric_date" date NOT NULL,
	"followers_count" integer DEFAULT 0 NOT NULL,
	"followers_delta" integer DEFAULT 0 NOT NULL,
	"total_reach" bigint DEFAULT 0 NOT NULL,
	"total_impressions" bigint DEFAULT 0 NOT NULL,
	"profile_views" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(6, 3) DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_daily_metrics_account_date" UNIQUE("account_id","metric_date")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"role" text NOT NULL,
	"workspace_ids" uuid[] NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_tokens" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"encrypted_payload" text NOT NULL,
	"iv" varchar(64) NOT NULL,
	"auth_tag" varchar(64) NOT NULL,
	"scopes" text[],
	"expires_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "social_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"mode" "adapter_mode" DEFAULT 'mock' NOT NULL,
	"platform_account_id" varchar(120) NOT NULL,
	"handle" varchar(120) NOT NULL,
	"display_name" varchar(150) NOT NULL,
	"avatar_url" text,
	"status" "account_status" DEFAULT 'active' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_social_accounts_platform_account" UNIQUE("workspace_id","platform","platform_account_id")
);
--> statement-breakpoint
CREATE TABLE "social_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"platform" "social_platform" NOT NULL,
	"platform_post_id" varchar(150) NOT NULL,
	"media_type" varchar(40) NOT NULL,
	"caption" text,
	"permalink" text NOT NULL,
	"thumbnail_url" text,
	"published_at" timestamp with time zone NOT NULL,
	"views_count" bigint DEFAULT 0 NOT NULL,
	"reach_count" bigint DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"shares_count" integer DEFAULT 0 NOT NULL,
	"saves_count" integer DEFAULT 0 NOT NULL,
	"engagement_rate" numeric(6, 3) DEFAULT 0 NOT NULL,
	"is_viral_spike" boolean DEFAULT false NOT NULL,
	"hourly_velocity" jsonb,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_social_posts_account_post" UNIQUE("account_id","platform_post_id")
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" uuid,
	"mode" "adapter_mode" NOT NULL,
	"status" varchar(20) NOT NULL,
	"records_upserted" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"duration_ms" integer,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(50) NOT NULL,
	"website_url" varchar(200),
	"shader_config" jsonb DEFAULT '{"primary":"#4F46E5","secondary":"#06B6D4"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_daily_metrics" ADD CONSTRAINT "account_daily_metrics_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_tokens" ADD CONSTRAINT "oauth_tokens_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_accounts" ADD CONSTRAINT "social_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_posts" ADD CONSTRAINT "social_posts_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_account_id_social_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."social_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_daily_metrics_account_date" ON "account_daily_metrics" USING btree ("account_id","metric_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_social_posts_account_published" ON "social_posts" USING btree ("account_id","published_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_social_posts_engagement" ON "social_posts" USING btree ("engagement_rate" DESC NULLS LAST);