export const APP_NAME = 'DevArena' as const;

export type AppEnvironment = 'development' | 'test' | 'production';

export const USER_ROLES = ['USER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROBLEM_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type ProblemDifficulty = (typeof PROBLEM_DIFFICULTIES)[number];

export const PROBLEM_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'] as const;
export type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const SUBMISSION_VERDICTS = [
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
] as const;
export type SubmissionVerdict = (typeof SUBMISSION_VERDICTS)[number];

export const EXECUTION_MODES = ['PRACTICE', 'CONTEST'] as const;
export type ExecutionMode = (typeof EXECUTION_MODES)[number];

export const INITIAL_SUPPORTED_LANGUAGES = ['cpp', 'javascript'] as const;
export type SupportedLanguageSlug = (typeof INITIAL_SUPPORTED_LANGUAGES)[number];
