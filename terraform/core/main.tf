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

variable "gcp_service_list" {
  description = "The list of apis necessary for fmltc"
  type = list(string)
  default = [
    #
    # Cloud resource manager is necessary for terraform to enable the
    # rest of the APIs.
    #
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
    "cloudfunctions.googleapis.com",
    # Double check if datastore is necessary
    "datastore.googleapis.com",
    "firestore.googleapis.com",
    "ml.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "appengine.googleapis.com",
    "serviceusage.googleapis.com"
  ]
}

resource "google_project_service" "gcp_services" {
  for_each = toset(var.gcp_service_list)
  service = each.key

  disable_dependent_services = true
}

#
# Sets up the firestore datastore (Don't really care about the app engine
# instance at this point, but there's no way to decouple them at present?
#
resource "google_app_engine_application" "fmltc-app" {
  project = var.project_id
  location_id = var.app_engine_region
  database_type = "CLOUD_FIRESTORE"
  depends_on = [google_project_service.gcp_services]
}

data "archive_file" "src" {
  type        = "zip"
  source_dir  = "${path.root}/../../server"
  output_path = "${path.root}/../../generated/src.zip"
  excludes = [ "__pycache__", "static" ]
}

resource "google_storage_bucket_object" "archive" {
  name   = "${data.archive_file.src.output_md5}.zip"
  bucket = google_storage_bucket.fmltc-gcf-source.name
  source = "${path.root}/../../generated/src.zip"
}

resource "google_cloudfunctions_function" "frame-extraction" {
  name        = "perform_action"
  description = "Extracts frames after a video upload"
  runtime     = "python37"

  available_memory_mb   = 8192
  timeout               = 540
  entry_point           = "perform_action"

  source_archive_bucket = google_storage_bucket.fmltc-gcf-source.name
  source_archive_object = google_storage_bucket_object.archive.name

  event_trigger {
    event_type  = "google.storage.object.finalize"
    resource    = google_storage_bucket.fmltc-action-parameters.name
  }
}
