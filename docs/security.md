# DevArena Security Architecture & Hostile Code Threat Model

## 1. Security Posture

Submitted source code in DevArena is treated as **hostile untrusted input**. A single isolation mechanism (such as an unprivileged Docker container, `rlimit`, or `seccomp` alone) is insufficient against determined adversaries. DevArena enforces a layered defense-in-depth architecture across the web layer, API layer, database layer, and judge execution subsystem.

## 2. Hostile Code Execution Sandbox Design

### Why Ordinary Container Defaults Are Insufficient

- Standard Docker containers share the host Linux kernel and default to permissive network namespaces, large PID limits, writable `/tmp` mounts, and broad syscall tables.
- Relying on `ulimit` (`rlimit`) alone fails to account for child process trees or kernel memory (slab/page cache) accurately.
- Relying on `seccomp` alone does not prevent CPU starvation, memory exhaustion, or filesystem fill attacks.

### Seven-Layer Judge Sandbox Architecture (ECS on EC2 with Bottlerocket)

1. **Host OS Hardening (AWS Bottlerocket)**:
   - Minimal, immutable Linux OS purpose-built for hosting containers with a read-only root filesystem (`dm-verity` verified), no SSH daemon, and **SELinux in enforcing mode** preventing container-to-host breakout.
2. **Network Isolation (`CLONE_NEWNET` + Isolated VPC Subnet)**:
   - Each compilation and test run executes inside an unshared Linux network namespace (`CLONE_NEWNET`) with zero external interfaces (even loopback `lo` is left unconfigured unless explicitly required).
   - At the AWS VPC level, judge worker EC2 instances reside in private isolated subnets with **no NAT Gateway route** and EC2 Instance Metadata Service v2 (`IMDSv2`) restricted to `HttpPutResponseHopLimit = 1` so container processes cannot reach `169.254.169.254`.
3. **Cgroups v2 Resource Accounting & Enforcement**:
   - Every single compile or test-case invocation is placed in a dedicated ephemeral child cgroup (`/sys/fs/cgroup/devarena-job-<uuid>`):
     - **CPU Limits**: `cpu.max` quota (1 vCPU equivalent) + `RLIMIT_CPU` ceiling.
     - **Memory Limits**: `memory.max` set to `problem.memoryLimitMb` (default `256 MB`, max `512 MB`) and `memory.swap.max = 0`. Inspecting `memory.events` (`oom_kill > 0`) provides deterministic `MEMORY_LIMIT_EXCEEDED` classification.
     - **Process & Thread Limits**: `pids.max = 16` during test execution (`32` during C++ compilation) and `RLIMIT_NPROC` to block fork bombs (`while(1) fork()`).
4. **Filesystem & Output Isolation (`CLONE_NEWNS` + Read-Only Root + Bounded `tmpfs`)**:
   - Root filesystem is bind-mounted read-only (`MS_RDONLY | MS_NOSUID | MS_NODEV`) exposing only `/usr/bin`, `/lib`, and `/lib64` needed by `g++` or `node`.
   - Each job receives a dedicated `/work` directory backed by a memory-bounded `tmpfs` (`size=32m,nr_inodes=1024,mode=0700,nosuid,nodev,noexec` during compile; `exec` enabled only on the compiled binary path during run).
   - `RLIMIT_FSIZE` caps individual file writes (`16 MB`), and the worker's stdout/stderr pipe reader terminates the process immediately with `OUTPUT_LIMIT_EXCEEDED` if combined output exceeds `problem.outputLimitBytes` (default `1 MB`).
5. **Syscall Filtering (Seccomp-BPF) & Capability Dropping**:
   - All Linux capabilities are dropped (`CapBnd = 0`, `CapEff = 0`, `CapPrm = 0`) and `PR_SET_NO_NEW_PRIVS` is set prior to `execve`.
   - A strict seccomp-BPF filter blocks dangerous kernel attack surfaces including `ptrace`, `mount`, `umount2`, `pivot_root`, `kexec_load`, `bpf`, `perf_event_open`, `userfaultfd`, `keyctl`, `add_key`, `request_key`, `init_module`, `finit_module`, `acct`, `swapon`, `swapoff`, `chroot`, and external `socket` families (`AF_INET`, `AF_INET6`, `AF_PACKET`, `AF_NETLINK`).
6. **Wall-Clock Watchdog & Deterministic Teardown**:
   - The parent worker enforces a hard wall-clock timer (`problem.timeLimitMs + 250ms` grace, max `10s`). On expiry, the worker writes `1` to `cgroup.kill` (atomically killing the entire process tree with `SIGKILL`), unmounts the ephemeral `/work` `tmpfs`, and deletes the child cgroup.
7. **Protection Against Cross-Submission Contamination**:
   - Every test case runs in a fresh PID namespace (`CLONE_NEWPID`), fresh IPC namespace (`CLONE_NEWIPC`), and fresh `/work` directory so background child processes or `/tmp` artifacts can never survive between test cases or leak across users' submissions.
   - The worker process wipes all environment variables (`env -i PATH=/usr/bin:/bin HOME=/work`) before spawning the sandbox so worker configuration is never visible inside `/proc/self/environ`.

## 3. Evaluation of Stronger Isolation: Firecracker MicroVMs vs. Bottlerocket Sandboxing

| Criterion                   | Bottlerocket + `nsjail`/Cgroups v2/Seccomp (Initial Production Target)                                   | Firecracker MicroVMs (Hardware KVM Virtualization)                                                                                           |
| :-------------------------- | :------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kernel Boundary**         | Shares Bottlerocket host kernel; relies on SELinux + seccomp-BPF + namespaces to block kernel exploits   | Dedicated guest Linux kernel per microVM via KVM hardware virtualization                                                                     |
| **Startup Latency**         | `< 15 ms` per test case invocation                                                                       | `~125 ms` cold boot (or `~15 ms` from memory snapshot)                                                                                       |
| **AWS Compute Requirement** | Runs on standard inexpensive EC2 instances (`c7g.medium` / `t4g.small`, `~$12–$30/mo`)                   | Requires AWS bare-metal instances (`c7g.metal` / `m6i.metal`, `>$2,500–$3,500/mo`) to access `/dev/kvm`                                      |
| **Operational Complexity**  | Standard ECS EC2 capacity provider + container image                                                     | Requires custom rootfs builder, KVM snapshot manager, and bare-metal fleet orchestration                                                     |
| **Architectural Decision**  | **Selected for Initial Production (Phase 7–9)** due to strong defense-in-depth at <1% of bare-metal cost | **Supported via `SandboxExecutor` abstraction** for future migration if enterprise multi-tenant risk or volume warrants bare-metal KVM hosts |

## 4. Threat Model Summary

| Threat Category                | Specific Attack                                            | Mitigation                                                                                                                                                               |
| :----------------------------- | :--------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Command Injection**          | Shell metacharacters in code or language fields            | Strict Zod allowlist on language slug; `spawn`/`execFile` with explicit `argv` arrays (`shell: false`); source written to fixed filenames (`main.cpp`, `solution.mjs`).  |
| **Infinite Loops / TLE**       | `while(1){}` or `#include </dev/random>`                   | Dual CPU (`RLIMIT_CPU`) and wall-clock watchdog timers on both compilation and execution phases.                                                                         |
| **Fork Bombs**                 | Recursive process/thread spawning                          | Cgroup v2 `pids.max = 16` + `cgroup.kill` atomic process-group termination.                                                                                              |
| **Memory Exhaustion**          | Heap/stack allocation bombs                                | Cgroup v2 `memory.max` with swap disabled (`memory.swap.max = 0`) + V8 `--max-old-space-size`.                                                                           |
| **Disk / Output Exhaustion**   | Infinite `cout` or `/tmp` file creation                    | Read-only rootfs, `32 MB` `tmpfs` quota, `RLIMIT_FSIZE`, and `1 MB` stdout/stderr stream cap.                                                                            |
| **Secret / Credential Theft**  | Reading env vars, AWS metadata, or DB credentials          | Cleared environment (`env -i`), `CLONE_NEWNET`, `IMDSv2` hop limit `1`, and least-privilege worker IAM role.                                                             |
| **Authentication Abuse**       | Brute force, credential stuffing, XSS token theft          | Argon2id password hashing, IP + account rate limiting, `HttpOnly; Secure; SameSite=Lax` session cookies, SHA-256 hashed session tokens in DB.                            |
| **Authorization & IDOR**       | Accessing another user's submission or unpublished problem | Server-side ownership checks (`submission.userId === actor.id \|\| actor.role === 'ADMIN'`), UUID primary keys, and `PUBLISHED` status filter on public problem queries. |
| **Hidden Test Case Leakage**   | Inspecting API responses for hidden test inputs/outputs    | Repository/DTO projection strips `input`, `expectedOutput`, and `actualOutput` whenever `TestCase.isPublic === false`.                                                   |
| **XSS via Problem Statements** | Malicious HTML/script tags in problem Markdown             | Strict Markdown sanitization (`rehype-sanitize`) and Content-Security-Policy (CSP) headers.                                                                              |

## 5. Authentication Flow Diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Browser
    participant Web as apps/web (Next.js)
    participant API as apps/api (Hono)
    participant DB as PostgreSQL

    User->>API: POST /api/v1/auth/login { email, password }
    API->>API: Enforce Rate Limit + Validate Payload (Zod)
    API->>DB: Fetch User + Verify Argon2id Hash
    API->>DB: Insert Session (SHA-256 tokenHash, expiresAt, ipAddress, userAgent)
    API-->>User: 200 OK + Set-Cookie: devarena_session=<token>; HttpOnly; Secure; SameSite=Lax
    User->>Web: Request Protected Route (/me/submissions or /admin)
    Web->>API: Forward Cookie -> GET /api/v1/auth/me
    API->>DB: Lookup non-expired, non-revoked Session by SHA-256(token)
    API-->>Web: { id, email, role, profile }
```

## 6. Unresolved Security Decisions (Tracked for Phase 7–9)

1. **Worker Database Access vs. Signed Internal Callback**: Whether `apps/judge-worker` connects to RDS PostgreSQL using a restricted database role (`SELECT` on `TestCase`/`Problem`/`Submission`, `INSERT/UPDATE` on `Submission`/`SubmissionTestResult` only) or fetches jobs and posts results via an HMAC-signed internal API endpoint on `apps/api`. Both options preserve the sandbox boundary because the untrusted child process runs with `CLONE_NEWNET` and cleared environment variables; final selection will be locked at the start of Phase 7.
2. **Seccomp Profile Tuning for Node.js 22 V8 Isolates**: Exact syscall allowlist for Node.js 22 (`epoll_pwait`, `futex`, `mmap`, `mprotect`, `clone3` for V8 worker threads) will be validated against the Judge Security Corpus in Phase 8.
