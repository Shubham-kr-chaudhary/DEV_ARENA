export {
  AuditRepository,
  sanitizeAuditMetadata,
  type AuditLogFilter,
  type AuditLogRecord,
  type CreateAuditLogInput,
} from './audit.repository.js';
export {
  computeEffectiveContestStatus,
  ContestRepository,
  type ContestDetailDto,
  type ContestLeaderboardEntryDto,
  type ContestListItemDto,
  type ContestScheduleSnapshot,
  type CreateContestAdminInput,
} from './contest.repository.js';
export {
  LeaderboardRepository,
  resolveRankTitleFromRating,
  type GlobalLeaderboardEntryDto,
  type RatingUpdateEntryInput,
} from './leaderboard.repository.js';
export {
  ProblemRepository,
  type CreateProblemAdminInput,
  type JudgeProblemExecutionBundle,
  type JudgeTestCaseDto,
  type ProblemCatalogueFilter,
  type ProblemCatalogueItemDto,
  type PublicProblemDetailDto,
  type PublicTestCaseDto,
  type TestCaseAdminInput,
  type UserSolveProgressStatus,
} from './problem.repository.js';
export {
  assertValidSubmissionStateTransition,
  isTerminalSubmissionStatus,
  isValidSubmissionStateTransition,
  SubmissionRepository,
  type CreateSubmissionInput,
  type FinalizeSubmissionVerdictInput,
  type FinalizeTestCaseResultInput,
  type SubmissionDetailForActorDto,
  type SubmissionSummaryDto,
  type SubmissionTestResultViewDto,
  type UserSubmissionHistoryFilter,
} from './submission.repository.js';
export {
  assertAdminActor,
  buildPaginationMeta,
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  mapPrismaRepositoryError,
  MAX_PAGE_SIZE,
  normalizePagination,
  RepositoryError,
  type NormalizedPagination,
  type PaginatedResult,
  type PaginationInput,
  type RepositoryActor,
  type RepositoryErrorCode,
} from './types.js';
export {
  UserRepository,
  type ActiveSessionWithUserDto,
  type AuthUserCredentialsRecord,
  type CreateSessionInput,
  type CreateUserWithProfileInput,
  type PublicUserProfileDto,
  type SafeProfileDto,
  type SafeUserWithProfileDto,
} from './user.repository.js';
