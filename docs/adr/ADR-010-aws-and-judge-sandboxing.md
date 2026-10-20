# ADR-010 — AWS Deployment Topology and Hostile Code Sandboxing

## Status

Accepted — Phase 1.

## Context

DevArena compiles and executes untrusted, potentially hostile C++ and JavaScript code submitted by internet users. Standard container defaults, `rlimit` alone, or running user code inside the API or worker process do not provide sufficient defense against kernel/syscall abuse, fork bombs, memory exhaustion, filesystem snooping, network scanning, or cross-submission interference.

At the same time, the platform must be deployable on AWS with clear cost controls, least-privilege IAM, private database networking, and a single Infrastructure-as-Code (IaC) tool.

## Options

### Judge Compute & Isolation Options

1. **ECS Fargate with in-container `child_process` + basic `ulimit`** — simplest AWS operations, but AWS Fargate restricts Linux kernel capabilities (`CAP_SYS_ADMIN` / nested cgroup and namespace creation) required by hardened sandbox supervisors like `nsjail` or `isolate`, leaving the worker process and sibling jobs exposed to weaker isolation.
2. **ECS on EC2 with AWS Bottlerocket + Hardened Linux Sandbox (`nsjail` / `bubblewrap` + Cgroups v2 + Seccomp-BPF + Network/PID/Mount Namespaces)** — provides full kernel support for nested unprivileged namespaces, cgroups v2 resource accounting, read-only rootfs, and custom seccomp filters on a minimal, immutable container OS with SELinux enforcing mode.
3. **Firecracker MicroVMs (per-submission hardware virtualization on bare-metal or `.metal` / nested KVM instances)** — strongest hardware-level kernel isolation per job, but requires bare-metal EC2 instances (`m6i.metal` / `c6g.metal`, costing >$3,000/month) or custom snapshot orchestration.

### Infrastructure-as-Code Options

1. **Terraform**
2. **AWS CDK**

## Decision

1. **Infrastructure as Code**:
   - Standardize on **Terraform** (`infra/terraform/`) as the single IaC tool (aligning with the repository's `.gitignore` configuration).
2. **Web and API Compute**:
   - Deploy `apps/web` and `apps/api` as stateless non-root containers on **AWS ECS Fargate** in private application subnets behind an Application Load Balancer (ALB).
3. **Initial Production Judge Compute Target**:
   - Deploy `apps/judge-worker` on **AWS ECS backed by EC2 Auto Scaling using the AWS Bottlerocket OS AMI** in dedicated isolated private subnets with **no internet egress (no NAT route)**.
   - Scale worker tasks and underlying Bottlerocket instances based on SQS `ApproximateNumberOfMessagesVisible` (supporting scale-to-zero or single `t4g.small` / `c7g.medium` baseline during low-traffic periods).
4. **Layered Defense-in-Depth Sandbox Model**:
   - Every compile and test execution runs inside an ephemeral, per-execution sandbox (`nsjail` / `bubblewrap`) enforcing:
     - **UID/GID Isolation**: Unprivileged ephemeral user (`65534:65534` / mapped subordinate UIDs) with `--cap-drop=ALL` and `PR_SET_NO_NEW_PRIVS`.
     - **CPU & Wall-Clock Limits**: Cgroup v2 CPU quota + `RLIMIT_CPU` + parent supervisor wall-clock watchdog timer (`SIGKILL` to entire process group and `cgroup.kill`).
     - **Memory Limits**: Cgroup v2 `memory.max` (`problem.memoryLimitMb`, default 256 MB) and `memory.swap.max = 0` to deterministically detect OOM kills (`MEMORY_LIMIT_EXCEEDED`).
     - **Process & Thread Limits**: Cgroup v2 `pids.max = 16` (execution) / `32` (compilation) and `RLIMIT_NPROC` to neutralize fork bombs.
     - **Filesystem & Output Limits**: Read-only rootfs containing only compiler/runtime binaries and standard libraries; ephemeral `tmpfs` `/work` directory capped at `32 MB` (`nr_inodes=1024`, `nosuid`, `nodev`); stream-enforced stdout/stderr truncation at `problem.outputLimitBytes` (default 1 MB) triggering `OUTPUT_LIMIT_EXCEEDED`.
     - **Network Isolation**: Dedicated empty network namespace (`CLONE_NEWNET`) with no external interface; EC2 instance metadata service (IMDSv2) restricted to `HttpPutResponseHopLimit = 1`.
     - **Syscall Restrictions**: Strict seccomp-BPF allowlist blocking `ptrace`, `mount`, `umount2`, `kexec_load`, `bpf`, `perf_event_open`, `userfaultfd`, `keyctl`, `init_module`, and raw socket creation.
     - **Clean Teardown**: After each test case, the worker terminates all PIDs in the sub-cgroup and wipes the ephemeral `tmpfs` workspace so no state persists across test cases or submissions.
5. **Firecracker MicroVM Evaluation & Future Upgrade Path**:
   - Firecracker microVMs provide stronger kernel-level isolation against zero-day Linux kernel privilege-escalation vulnerabilities, and the `LanguageRunner` / `SandboxExecutor` interface in `apps/judge-worker` is intentionally abstracted so a Firecracker executor can replace the `nsjail` executor without changing worker business logic.
   - However, because AWS only exposes `/dev/kvm` on bare-metal EC2 instances (`*.metal`), Firecracker is deferred for initial production in favor of Bottlerocket + SELinux + `nsjail`/cgroups v2/seccomp-BPF until platform volume justifies bare-metal instance cost.

## Consequences

- Untrusted user code is isolated by 7 independent security layers (isolated VPC subnet, Bottlerocket SELinux host, ECS container boundary, Linux namespaces, cgroups v2 limits, seccomp-BPF syscall filter, and non-root UID).
- The judge worker never mounts `/var/run/docker.sock`, never runs in `--privileged` mode, and holds minimal IAM permissions (`sqs:ReceiveMessage`, `sqs:DeleteMessage`, `sqs:ChangeMessageVisibility`).
- Unresolved sizing parameters (exact Bottlerocket instance family `c7g` vs `c7i`, warm pool size during contests, and whether judge results are written via restricted DB credentials or internal signed API callback) are explicitly tracked in `docs/aws.md` and `docs/security.md` prior to Phase 7/9 implementation.
