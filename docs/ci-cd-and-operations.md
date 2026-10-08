# CI/CD & Operations Deep Dive — GitOps, Zero-Secret OIDC & Governance

**Lead:** Eugene Sewor ([@eugene-sew](https://github.com/eugene-sew))  
**Automation Workflows:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) & [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)  
**Amplify Build Spec:** [`amplify.yml`](../amplify.yml)  
**Governance Script:** [`scripts/create_team_iam.sh`](../scripts/create_team_iam.sh)  
**Associated Architectural Records:** [ADR-005 (OIDC CI/CD)](./architecture-decisions.md#adr-005-zero-trust-gitops-cicd-deployment-via-aws-iam-oidc), [ADR-009 (Amplify Hosting)](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1), [ADR-011 (Node.js/TypeScript Backend)](./architecture-decisions.md#adr-011-backend-runtime-migration-to-nodejs-and-typescript), [L-001 (GitHub App Auth)](./learnings.md#l-001--aws-amplify-hosting--terraform--github-app-a-public-api-gap)

---

## 1. GitOps Philosophy & Release Flow

AgroConnect adheres to strict GitOps delivery principles: **merging to `main` is what ships to production**. No manual deployments, CLI pushes, or ClickOps changes occur in production.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Feature Branch Development                      │
│        (feat/*, fix/*, chore/*, docs/*)                                │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Open Pull Request into `main`
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Automated CI Verification                       │
│                        (.github/workflows/ci.yml)                      │
│                                                                        │
│   ├── Backend Smoke Test (Node.js 24, npm build & /health probe)       │
│   └── Terraform Validation (terraform fmt -check & validate)           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Code Owner Approval + Merge
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Automated Production Deployments                   │
│                                                                        │
│   [Backend Deployment: deploy.yml]                                     │
│     1. GitHub Actions requests short-lived token via AWS IAM OIDC      │
│     2. Build Docker container & tag (:latest & :<sha>)                 │
│     3. Push container to Amazon ECR (af-south-1)                       │
│     4. Trigger ASG Rolling Instance Refresh (50% MinHealthy, 180s Warm)│
│                                                                        │
│   [Frontend Deployment: AWS Amplify Hosting]                           │
│     1. Amplify detects Git push to `main` via installed GitHub App     │
│     2. Executes amplify.yml build in frontend/agroconnect-pwa          │
│     3. Deploys static build to global CloudFront Edge network          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Continuous Integration ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml))

Every pull request targeting `main` is gated by two parallel CI validation jobs:

### Job 1: `backend` (Smoke Test)
* Runs on `ubuntu-latest` with **Node.js 24** (`actions/setup-node@v4`) and npm caching.
* Installs dependencies via `npm ci`.
* Compiles TypeScript application via `npm run build`.
* Boots the compiled server (`PORT=8000 node dist/server.js &`) and probes `http://localhost:8000/health` up to 20 times (0.5s interval).
* Guarantees that compilation errors, broken type definitions, and runtime boot failures fail the PR before review.

### Job 2: `terraform` (Format & Validation)
* Runs on `ubuntu-latest` with Terraform `1.9.8`.
* Executes recursive formatting verification:
  ```bash
  terraform fmt -check -recursive
  ```
* Initializes modules without remote backend (`terraform init -backend=false`).
* Validates provider syntax and dependency graphs across all 7 modules:
  ```bash
  terraform validate
  ```

---

## 3. Backend Continuous Deployment ([`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml))

Backend deployments trigger automatically upon pushes to `main` that modify `backend/**` or `.github/workflows/deploy.yml`.

### Zero-Secret AWS IAM OIDC Federation
AgroConnect eliminates long-lived static AWS access keys (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`):
* GitHub Actions requests a JSON Web Token (JWT) from GitHub's OIDC provider.
* The workflow exchanges this JWT for temporary, short-lived AWS STS credentials using `aws-actions/configure-aws-credentials@v4`.
* **IAM Trust Policy Condition:**
  ```json
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:ASU-MICS-2028/cc-group-3-prosit-1:*"
    }
  }
  ```

### Deterministic Container Image Tagging
Docker images are built and pushed to Amazon ECR (`agroconnect-dev-backend`) in `af-south-1` with dual tags:
1. `:latest` — Pointer for the launch template and current operational state.
2. `:${{ github.sha }}` — Immutable commit SHA guaranteeing deterministic auditability and fast rollback capability.

### Zero-Downtime ASG Rolling Refresh
To deploy the new container image to EC2 without dropping incoming requests, the workflow initiates an Auto Scaling Group instance refresh:
```bash
aws autoscaling start-instance-refresh \
  --auto-scaling-group-name "$ASG_NAME" \
  --preferences '{"MinHealthyPercentage":50,"InstanceWarmup":180}'
```
* **`MinHealthyPercentage: 50`:** Guarantees that at least half the instances remain healthy and serving traffic while nodes are replaced sequentially.
* **`InstanceWarmup: 180`:** Grants newly booted instances 3 minutes to pull the ECR container image, start Docker, and pass ALB `/health` checks before older instances are terminated.
* **Status Polling:** The workflow polls `describe-instance-refreshes` every 15 seconds until status reaches `Successful` (or fails cleanly on errors).

---

## 4. Frontend Continuous Deployment ([`amplify.yml`](../amplify.yml))

The Progressive Web App deployment is automated through AWS Amplify Hosting:
* **Monorepo Build Spec:** Committed at the repository root:
  ```yaml
  version: 1
  applications:
    - appRoot: frontend/agroconnect-pwa
      frontend:
        phases:
          preBuild:
            commands:
              - npm ci
          build:
            commands:
              - npm run build
        artifacts:
          baseDirectory: dist
          files:
            - '**/*'
        cache:
          paths:
            - node_modules/**/*
  ```
* **Repository Access:** Managed via the **AWS Amplify GitHub App** installed on the `ASU-MICS-2028` GitHub organization, bypassing GitHub deploy keys (see [ADR-009](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1) and [L-001](./learnings.md#l-001--aws-amplify-hosting--terraform--github-app-a-public-api-gap)).
* **Edge Invalidation:** On build completion, updated static assets and Service Worker scripts are automatically purged across CloudFront edge locations worldwide.

---

## 5. Operations & Team IAM Governance ([`scripts/create_team_iam.sh`](../scripts/create_team_iam.sh))

Team member provisioning is automated via an administrative bash script enforcing least privilege and mandatory Multi-Factor Authentication:

### Script Capabilities
1. Creates the IAM Group `agroconnect-highlanders`.
2. Attaches the AWS-managed `PowerUserAccess` policy (full access to cloud services, with administrative IAM mutations restricted).
3. Attaches `IAMUserChangePassword` allowing self-service credential updates.
4. Attaches a custom **`ForceMFA`** policy document:
   ```json
   {
     "Sid": "DenyAllExceptMFASetupUntilMFAed",
     "Effect": "Deny",
     "NotAction": [
       "iam:CreateVirtualMFADevice",
       "iam:EnableMFADevice",
       "iam:GetUser",
       "iam:ListMFADevices",
       "iam:ResyncMFADevice",
       "iam:ChangePassword",
       "sts:GetSessionToken"
     ],
     "Resource": "*",
     "Condition": {
       "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" }
     }
   }
   ```
5. Provisions individual IAM users for team leads:
   * `elise-kennedy-angbo` (Data Lead)
   * `perfect-avugla` (Frontend Lead)
   * `joseph-etse` (Project Manager)
6. Generates high-entropy passwords with mandatory reset flags (`--password-reset-required`), exporting credentials into a permissions-restricted local directory (`team_credentials/`).

---

## 6. Observability & Operational Probes

1. **ALB Health Probes:** Continuously checks `GET /health` on port 8000 every 15 seconds. If an instance fails 2 consecutive checks, the ALB stops routing traffic to it, and the ASG replaces it automatically.
2. **CloudWatch Metrics:**
   * `AWS/ApplicationELB`: `RequestCount`, `TargetResponseTime`, `HTTPCode_Target_2XX_Count`, `HTTPCode_Target_5XX_Count`.
   * `AWS/EC2`: `CPUUtilization`, `NetworkIn`, `NetworkOut`.
   * Scaling Metric: `ALBRequestCountPerTarget` evaluated on a 1-minute aggregation interval.
3. **AWS Budgets Alert:** Proactive alerting configured with a \$5 spend limit to notify team leads of any anomalous resource creation before budget impacts occur.

