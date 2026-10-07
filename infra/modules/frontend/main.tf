# This module runs in a provider region that supports Amplify (eu-west-1).
# Repo access uses the AWS Amplify GitHub App (installed once at the GitHub org
# level), NOT a PAT or deploy key. ASU-MICS-2028's org policy disables deploy
# keys, which is what the classic PAT flow requires under the hood. The GitHub
# App bypasses that entirely.
#
# With the App installed, Terraform creates the Amplify app with no
# access_token — Amplify looks up the installed App for the repo at create time
# and uses it for cloning + webhooks.
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      configuration_aliases = [aws]
    }
  }
}

resource "aws_amplify_app" "pwa" {
  name       = "${var.name_prefix}-frontend"
  repository = var.repository_url
  platform   = "WEB" # static SPA, not SSR

  # Build spec lives in amplify.yml at repo root (versioned alongside the app).
  # Leaving build_spec unset tells Amplify to use the committed file.

  # No preview envs; only `main` deploys. Keeps build minutes down.
  enable_auto_branch_creation = false
  enable_branch_auto_build    = true

  # SPA fallback: any 404 on a non-asset path serves /index.html so React Router
  # can handle client-side routes. The regex excludes files with extensions so
  # real missing assets still return 404.
  custom_rule {
    source = "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webmanifest)$)([^.]+$)/>"
    status = "200"
    target = "/index.html"
  }

  # Env vars inherited by all branches unless overridden.
  environment_variables = {
    VITE_API_URL = var.api_url
    # Monorepo marker — amplify.yml at repo root handles the cd.
    AMPLIFY_MONOREPO_APP_ROOT = "frontend/agroconnect-pwa"
  }
}

resource "aws_amplify_branch" "main" {
  app_id      = aws_amplify_app.pwa.id
  branch_name = var.production_branch
  stage       = "PRODUCTION"
  framework   = "React"

  enable_auto_build           = true
  enable_pull_request_preview = false

  environment_variables = {
    VITE_API_URL = var.api_url
  }
}

# Domain association. wait_for_verification=false so apply returns immediately
# with the CNAME + ACM-validation values; we then publish both at Hostinger
# and Amplify's cert validator picks them up asynchronously.
resource "aws_amplify_domain_association" "app" {
  app_id      = aws_amplify_app.pwa.id
  domain_name = var.custom_domain

  wait_for_verification = false

  sub_domain {
    branch_name = aws_amplify_branch.main.branch_name
    prefix      = var.custom_subdomain_prefix
  }
}
