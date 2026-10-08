# Remote state. The bucket and DynamoDB lock table are bootstrapped once in
# infra/bootstrap/ (see infra/README.md). Committed so every operator and CI
# initialises the same backend.
#
# After changing this block: terraform init -migrate-state

terraform {
  backend "s3" {
    bucket       = "agroconnect-tfstate-315224414532"
    key          = "agroconnect/dev/terraform.tfstate"
    region       = "af-south-1"
    encrypt      = true
    use_lockfile = true
    profile      = "ashesi-dev"
  }
}
