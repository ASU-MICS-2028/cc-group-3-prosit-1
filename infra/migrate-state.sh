#!/usr/bin/env bash
# One-shot: move pre-module state addresses to module.<x>.<addr>.
# Default is DRY-RUN; pass --apply to actually run the mv.
#
# Idempotent: skips any move whose source address is already gone.
set -euo pipefail

MODE="dry"
if [[ "${1:-}" == "--apply" ]]; then
  MODE="apply"
fi

# Each line: "<old-address> <new-address>"
# Keep this list in sync with modules/*/main.tf
MOVES=(
  # ---- network ----
  "aws_vpc.main|module.network.aws_vpc.main"
  "aws_internet_gateway.igw|module.network.aws_internet_gateway.igw"
  "aws_subnet.public[0]|module.network.aws_subnet.public[0]"
  "aws_subnet.public[1]|module.network.aws_subnet.public[1]"
  "aws_subnet.private[0]|module.network.aws_subnet.private[0]"
  "aws_subnet.private[1]|module.network.aws_subnet.private[1]"
  "aws_subnet.data[0]|module.network.aws_subnet.data[0]"
  "aws_subnet.data[1]|module.network.aws_subnet.data[1]"
  "aws_route_table.public|module.network.aws_route_table.public"
  "aws_route_table.private|module.network.aws_route_table.private"
  "aws_route_table.data|module.network.aws_route_table.data"
  "aws_route_table_association.public[0]|module.network.aws_route_table_association.public[0]"
  "aws_route_table_association.public[1]|module.network.aws_route_table_association.public[1]"
  "aws_route_table_association.private[0]|module.network.aws_route_table_association.private[0]"
  "aws_route_table_association.private[1]|module.network.aws_route_table_association.private[1]"
  "aws_route_table_association.data[0]|module.network.aws_route_table_association.data[0]"
  "aws_route_table_association.data[1]|module.network.aws_route_table_association.data[1]"

  # ---- nat ----
  "data.aws_ami.fck_nat|module.nat.data.aws_ami.fck_nat"
  "aws_security_group.nat|module.nat.aws_security_group.nat"
  "aws_network_interface.nat|module.nat.aws_network_interface.nat"
  "aws_instance.nat|module.nat.aws_instance.nat"

  # ---- alb ----
  "aws_security_group.alb|module.alb.aws_security_group.alb"
  "aws_security_group.app|module.alb.aws_security_group.app"
  "aws_lb.app|module.alb.aws_lb.app"
  "aws_lb_target_group.app|module.alb.aws_lb_target_group.app"
  "aws_lb_listener.http|module.alb.aws_lb_listener.http"
  "aws_lb_listener.https|module.alb.aws_lb_listener.https"
  "aws_acm_certificate.api|module.alb.aws_acm_certificate.api"
  "aws_acm_certificate_validation.api|module.alb.aws_acm_certificate_validation.api"

  # ---- compute ----
  "data.aws_iam_policy_document.ec2_assume|module.compute.data.aws_iam_policy_document.ec2_assume"
  "aws_iam_role.ec2|module.compute.aws_iam_role.ec2"
  "aws_iam_role_policy_attachment.ec2_ssm|module.compute.aws_iam_role_policy_attachment.ec2_ssm"
  "aws_iam_role_policy_attachment.ec2_ecr|module.compute.aws_iam_role_policy_attachment.ec2_ecr"
  "aws_iam_instance_profile.ec2|module.compute.aws_iam_instance_profile.ec2"
  "aws_launch_template.app|module.compute.aws_launch_template.app"
  "aws_autoscaling_group.app|module.compute.aws_autoscaling_group.app"

  # ---- ecr ----
  "aws_ecr_repository.backend|module.ecr.aws_ecr_repository.backend"

  # ---- cicd ----
  "data.tls_certificate.github|module.cicd.data.tls_certificate.github"
  "aws_iam_openid_connect_provider.github|module.cicd.aws_iam_openid_connect_provider.github"
  "data.aws_iam_policy_document.gha_assume|module.cicd.data.aws_iam_policy_document.gha_assume"
  "aws_iam_role.gha_deploy|module.cicd.aws_iam_role.gha_deploy"
  "data.aws_iam_policy_document.gha_deploy|module.cicd.data.aws_iam_policy_document.gha_deploy"
  "aws_iam_role_policy.gha_deploy|module.cicd.aws_iam_role_policy.gha_deploy"
)

# Snapshot current state once; cheap to query repeatedly from memory.
STATE_LIST=$(terraform state list)

moved=0
skipped=0
for pair in "${MOVES[@]}"; do
  src="${pair%|*}"
  dst="${pair#*|}"

  if ! grep -Fxq "$src" <<< "$STATE_LIST"; then
    echo "skip (not in state): $src"
    skipped=$((skipped + 1))
    continue
  fi

  if [[ "$MODE" == "dry" ]]; then
    echo "would mv: $src  ->  $dst"
  else
    echo "mv: $src -> $dst"
    terraform state mv "$src" "$dst"
  fi
  moved=$((moved + 1))
done

echo
echo "---"
echo "mode: $MODE"
echo "candidates: $((moved + skipped))  moved/would-move: $moved  skipped: $skipped"
if [[ "$MODE" == "dry" ]]; then
  echo "re-run with --apply to execute"
fi
