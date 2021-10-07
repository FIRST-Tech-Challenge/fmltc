terraform {
  backend "gcs" {
    #
    # Terraform is broken w.r.t. variables in a backend block.
    # So we must resort to hardcoded values for the bucket and
    # credentials.
    #
    # The bucket should be created via gsutil before running terraform
    # for the first time.
    #
    bucket = "ftc-ml-firstinspires-prod-tf-state"
  }
}
