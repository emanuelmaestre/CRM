ALTER TABLE "shopee_api_call" ADD COLUMN "request_bytes" integer;--> statement-breakpoint
ALTER TABLE "shopee_api_call" ADD COLUMN "response_bytes" integer;--> statement-breakpoint
ALTER TABLE "shopee_api_call" ADD COLUMN "duration_ms" integer;