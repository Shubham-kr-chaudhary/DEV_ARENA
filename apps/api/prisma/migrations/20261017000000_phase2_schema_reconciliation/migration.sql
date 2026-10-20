-- Phase 2 Incremental Migration: Reconcile baseline schema with Master Engineering Specification
-- Non-destructive upgrade preserving all existing data from 20260922145432_init

-- 1. Create new enums
CREATE TYPE "OAuthProvider" AS ENUM ('GITHUB', 'GOOGLE');

CREATE TYPE "ComparisonMode" AS ENUM ('EXACT', 'TRIM_WHITESPACE', 'TOKEN_WHITESPACE', 'FLOAT_TOLERANCE', 'CUSTOM_CHECKER');

CREATE TYPE "ExecutionMode" AS ENUM ('PRACTICE', 'CONTEST');

-- 2. Extend ProblemStatus enum with REVIEW
ALTER TYPE "ProblemStatus" ADD VALUE IF NOT EXISTS 'REVIEW' BEFORE 'PUBLISHED';

-- 3. Upgrade SubmissionStatus enum losslessly (COMPILE_ERROR -> COMPILATION_ERROR, SYSTEM_ERROR -> INTERNAL_ERROR)
ALTER TYPE "SubmissionStatus" RENAME TO "SubmissionStatus_old";

CREATE TYPE "SubmissionStatus" AS ENUM (
    'QUEUED',
    'RUNNING',
    'ACCEPTED',
    'WRONG_ANSWER',
    'COMPILATION_ERROR',
    'RUNTIME_ERROR',
    'TIME_LIMIT_EXCEEDED',
    'MEMORY_LIMIT_EXCEEDED',
    'OUTPUT_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
    'CANCELLED'
);

ALTER TABLE "Submission" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Submission" ALTER COLUMN "status" TYPE "SubmissionStatus" USING (
    CASE "status"::text
        WHEN 'COMPILE_ERROR' THEN 'COMPILATION_ERROR'::"SubmissionStatus"
        WHEN 'SYSTEM_ERROR' THEN 'INTERNAL_ERROR'::"SubmissionStatus"
        ELSE "status"::text::"SubmissionStatus"
    END
);

ALTER TABLE "Submission" ALTER COLUMN "status" SET DEFAULT 'QUEUED';

ALTER TABLE "SubmissionTestResult" ALTER COLUMN "status" TYPE "SubmissionStatus" USING (
    CASE "status"::text
        WHEN 'COMPILE_ERROR' THEN 'COMPILATION_ERROR'::"SubmissionStatus"
        WHEN 'SYSTEM_ERROR' THEN 'INTERNAL_ERROR'::"SubmissionStatus"
        ELSE "status"::text::"SubmissionStatus"
    END
);

DROP TYPE "SubmissionStatus_old";

-- 4. Upgrade ContestStatus enum losslessly (LIVE -> RUNNING, FINISHED -> ENDED)
ALTER TYPE "ContestStatus" RENAME TO "ContestStatus_old";

CREATE TYPE "ContestStatus" AS ENUM (
    'DRAFT',
    'UPCOMING',
    'RUNNING',
    'ENDED',
    'CANCELLED'
);

ALTER TABLE "Contest" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Contest" ALTER COLUMN "status" TYPE "ContestStatus" USING (
    CASE "status"::text
        WHEN 'LIVE' THEN 'RUNNING'::"ContestStatus"
        WHEN 'FINISHED' THEN 'ENDED'::"ContestStatus"
        ELSE "status"::text::"ContestStatus"
    END
);

ALTER TABLE "Contest" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "ContestStatus_old";

-- 5. Alter User table (add passwordHash)
ALTER TABLE "User" ADD COLUMN "passwordHash" VARCHAR(512);

-- 6. Create Session and OAuthAccount tables
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(128) NOT NULL,
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OAuthAccount" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerAccountId" VARCHAR(160) NOT NULL,
    "providerEmail" VARCHAR(320),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- 7. Alter Profile table (add rating, rank, and statistics columns)
ALTER TABLE "Profile"
    ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 1200,
    ADD COLUMN "maxRating" INTEGER NOT NULL DEFAULT 1200,
    ADD COLUMN "rankTitle" VARCHAR(64) NOT NULL DEFAULT 'Unrated',
    ADD COLUMN "solvedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "attemptedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "contestCount" INTEGER NOT NULL DEFAULT 0;

-- 8. Alter Problem table (add examples, editorial, authorId, sourceSizeLimitBytes, comparisonMode, floatTolerance)
ALTER TABLE "Problem"
    ADD COLUMN "examples" JSONB NOT NULL DEFAULT '[]',
    ADD COLUMN "editorial" TEXT,
    ADD COLUMN "authorId" UUID,
    ADD COLUMN "sourceSizeLimitBytes" INTEGER NOT NULL DEFAULT 65536,
    ADD COLUMN "comparisonMode" "ComparisonMode" NOT NULL DEFAULT 'TRIM_WHITESPACE',
    ADD COLUMN "floatTolerance" DOUBLE PRECISION;

-- 9. Alter TestCase table (add explanation, weight, group, updatedAt)
ALTER TABLE "TestCase"
    ADD COLUMN "explanation" TEXT,
    ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "group" VARCHAR(80),
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 10. Alter Submission table (add contestId, mode, idempotencyKey, judgeJobId, judgeAttempts, updatedAt)
ALTER TABLE "Submission"
    ADD COLUMN "contestId" UUID,
    ADD COLUMN "mode" "ExecutionMode" NOT NULL DEFAULT 'PRACTICE',
    ADD COLUMN "idempotencyKey" VARCHAR(128),
    ADD COLUMN "judgeJobId" VARCHAR(128),
    ADD COLUMN "judgeAttempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 11. Alter ContestParticipant table (add penaltyMinutes, solvedCount, lastAcceptedAt)
ALTER TABLE "ContestParticipant"
    ADD COLUMN "penaltyMinutes" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "solvedCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastAcceptedAt" TIMESTAMP(3);

-- 12. Alter UserProblemProgress table (add bestRuntimeMs, bestMemoryKb, bestSubmissionId)
ALTER TABLE "UserProblemProgress"
    ADD COLUMN "bestRuntimeMs" INTEGER,
    ADD COLUMN "bestMemoryKb" INTEGER,
    ADD COLUMN "bestSubmissionId" UUID;

-- 13. Create new unique and performance indexes
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

CREATE INDEX "Profile_rating_solvedCount_idx" ON "Profile"("rating" DESC, "solvedCount" DESC);
CREATE INDEX "Profile_solvedCount_rating_idx" ON "Profile"("solvedCount" DESC, "rating" DESC);

CREATE INDEX "Problem_authorId_status_idx" ON "Problem"("authorId", "status");

CREATE UNIQUE INDEX "Submission_userId_idempotencyKey_key" ON "Submission"("userId", "idempotencyKey");
CREATE INDEX "Submission_contestId_userId_createdAt_idx" ON "Submission"("contestId", "userId", "createdAt");
CREATE INDEX "Submission_contestId_problemId_status_idx" ON "Submission"("contestId", "problemId", "status");

CREATE INDEX "ContestParticipant_contestId_finalScore_penaltyMinutes_idx" ON "ContestParticipant"("contestId", "finalScore" DESC, "penaltyMinutes" ASC);

-- 14. Add foreign keys for new relations
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Problem" ADD CONSTRAINT "Problem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Submission" ADD CONSTRAINT "Submission_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
