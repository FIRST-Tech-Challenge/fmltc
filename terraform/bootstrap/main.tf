terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      version = "3.77.0"
    }
  }
}

provider "google" {
  credentials = file(var.credentials_file)

  project = var.project_id
  region  = var.region
  zone    = var.zone
}

resource "google_storage_bucket" "fmltc-tf-state" {
  name          = "${var.project_name}-tf-state"
  location      = "US"
  force_destroy = true
}

