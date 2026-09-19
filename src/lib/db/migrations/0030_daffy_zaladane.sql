ALTER TABLE "candidate_qualifications" ALTER COLUMN "qualification_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_skills" ALTER COLUMN "skill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "candidate_qualifications" ADD COLUMN "custom_name" varchar(200);--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD COLUMN "custom_name" varchar(200);--> statement-breakpoint
ALTER TABLE "candidate_qualifications" ADD CONSTRAINT "candidate_quals_person_custom_unique" UNIQUE("person_id","custom_name");--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_person_custom_unique" UNIQUE("person_id","custom_name");--> statement-breakpoint
ALTER TABLE "candidate_qualifications" ADD CONSTRAINT "candidate_quals_qual_xor" CHECK (("candidate_qualifications"."qualification_id" IS NOT NULL) <> ("candidate_qualifications"."custom_name" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_xor" CHECK (("candidate_skills"."skill_id" IS NOT NULL) <> ("candidate_skills"."custom_name" IS NOT NULL));