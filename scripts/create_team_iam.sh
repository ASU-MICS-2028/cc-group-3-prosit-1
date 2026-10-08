#!/usr/bin/env bash
# One-shot script. Rerunnable (idempotent on user/group creation errors).
# Creates a team group with PowerUserAccess + MFA-enforcement policy, adds 3 users,
# gives each a console password forcing reset on first login, writes creds to CSVs.
set -euo pipefail

PROFILE="${AWS_PROFILE:-ashesi-dev}"
REGION="${AWS_REGION:-af-south-1}"
GROUP="agroconnect-highlanders"
OUT_DIR="$(cd "$(dirname "$0")"/.. && pwd)/team_credentials"

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"

# name:role
MEMBERS=(
  "elise-kennedy-angbo:data-lead"
  "perfect-avugla:frontend-lead"
  "joseph-etse:project-manager"
)

aws() { command aws --profile "$PROFILE" --region "$REGION" "$@"; }

echo "==> Group $GROUP"
aws iam get-group --group-name "$GROUP" >/dev/null 2>&1 || aws iam create-group --group-name "$GROUP"

aws iam attach-group-policy --group-name "$GROUP" \
  --policy-arn arn:aws:iam::aws:policy/PowerUserAccess || true
aws iam attach-group-policy --group-name "$GROUP" \
  --policy-arn arn:aws:iam::aws:policy/IAMUserChangePassword || true

MFA_POLICY_NAME="ForceMFA"
MFA_POLICY_DOC='{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowManageOwnMFA",
      "Effect": "Allow",
      "Action": [
        "iam:CreateVirtualMFADevice","iam:EnableMFADevice","iam:ResyncMFADevice",
        "iam:ListMFADevices","iam:ListVirtualMFADevices","iam:DeactivateMFADevice",
        "iam:DeleteVirtualMFADevice","iam:GetUser","iam:ChangePassword"
      ],
      "Resource": [
        "arn:aws:iam::*:user/${aws:username}",
        "arn:aws:iam::*:mfa/${aws:username}"
      ]
    },
    {
      "Sid": "DenyAllExceptMFASetupUntilMFAed",
      "Effect": "Deny",
      "NotAction": [
        "iam:CreateVirtualMFADevice","iam:EnableMFADevice","iam:GetUser",
        "iam:ListMFADevices","iam:ListVirtualMFADevices","iam:ResyncMFADevice",
        "iam:ChangePassword","sts:GetSessionToken"
      ],
      "Resource": "*",
      "Condition": { "BoolIfExists": { "aws:MultiFactorAuthPresent": "false" } }
    }
  ]
}'

aws iam put-group-policy --group-name "$GROUP" \
  --policy-name "$MFA_POLICY_NAME" --policy-document "$MFA_POLICY_DOC"

for entry in "${MEMBERS[@]}"; do
  user="${entry%%:*}"
  role_tag="${entry##*:}"
  csv="$OUT_DIR/${user}_credentials.csv"

  echo "==> User $user ($role_tag)"
  aws iam get-user --user-name "$user" >/dev/null 2>&1 || \
    aws iam create-user --user-name "$user" \
      --tags "Key=Project,Value=agroconnect" "Key=Role,Value=$role_tag" "Key=Team,Value=highlanders"

  aws iam add-user-to-group --group-name "$GROUP" --user-name "$user"

  # 20-char password from base64, strip padding/url-unsafe chars.
  PASSWORD=$(openssl rand -base64 24 | tr -d '=/+\n' | cut -c1-20)Aa1!

  if aws iam get-login-profile --user-name "$user" >/dev/null 2>&1; then
    aws iam update-login-profile --user-name "$user" --password "$PASSWORD" --password-reset-required
  else
    aws iam create-login-profile --user-name "$user" --password "$PASSWORD" --password-reset-required
  fi

  account=$(aws sts get-caller-identity --query Account --output text)
  console_url="https://${account}.signin.aws.amazon.com/console"

  umask 077
  {
    echo "User Name,Password,Console URL,Role,MFA Required"
    echo "$user,$PASSWORD,$console_url,$role_tag,yes (must enable on first login)"
  } > "$csv"
  chmod 600 "$csv"
  echo "    creds -> $csv"
done

echo ""
echo "Done. Share each CSV with its owner over a secure channel."
echo "They must enable MFA before they can do anything else."
