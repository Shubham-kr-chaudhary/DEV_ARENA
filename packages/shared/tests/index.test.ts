import { describe, expect, it } from 'vitest';
import {
  APP_NAME,
  EXECUTION_MODES,
  INITIAL_SUPPORTED_LANGUAGES,
  PROBLEM_DIFFICULTIES,
  PROBLEM_STATUSES,
  SUBMISSION_VERDICTS,
  USER_ROLES,
} from '../src/index.js';

describe('shared foundation', () => {
  it('exposes the product name', () => {
    expect(APP_NAME).toBe('DevArena');
  });

  it('defines canonical roles, problem statuses, verdicts, and initial languages', () => {
    expect(USER_ROLES).toEqual(['USER', 'ADMIN']);
    expect(PROBLEM_DIFFICULTIES).toEqual(['EASY', 'MEDIUM', 'HARD']);
    expect(PROBLEM_STATUSES).toEqual(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']);
    expect(EXECUTION_MODES).toEqual(['PRACTICE', 'CONTEST']);
    expect(INITIAL_SUPPORTED_LANGUAGES).toEqual(['cpp', 'javascript']);
    expect(SUBMISSION_VERDICTS).toContain('COMPILATION_ERROR');
    expect(SUBMISSION_VERDICTS).toContain('INTERNAL_ERROR');
  });
});
