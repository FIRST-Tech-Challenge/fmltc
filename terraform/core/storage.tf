
resource "google_storage_bucket" "fmltc" {
  name          = var.project_name
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-blobs" {
  name          = "${var.project_name}-blobs"
  location      = "US"
  force_destroy = true

  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_default_object_access_control" "public_rule" {
  bucket = google_storage_bucket.fmltc.name
  role   = "READER"
  entity = "allUsers"
}

resource "google_storage_bucket" "fmltc-action-parameters" {
  name          = "${var.project_name}-action-parameters"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-gcf-source" {
  name          = "${var.project_name}-gcf-source"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-gae-source" {
  name          = "${var.project_name}-gae-source"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket_object" "teams" {
  name         = "team_info/teams"
  source       = "${path.root}/../../teams"
  bucket       = google_storage_bucket.fmltc-blobs.name
  depends_on   = [google_storage_default_object_access_control.public_rule]
}

resource "google_storage_bucket_object" "styles" {
  name         = "static/css/styles.css"
  source       = "${path.root}/../../server/static/css/styles.css"
  content_type = "text/css"
  bucket       = google_storage_bucket.fmltc.name
  depends_on   = [google_storage_default_object_access_control.public_rule]
}

resource "google_storage_bucket_object" "closure_js" {
  name         = "compiled/js/fmltc.js"
  source       = "${path.root}/../../compiled/js/fmltc.js"
  content_type = "application/css"
  bucket       = google_storage_bucket.fmltc.name
  depends_on   = [google_storage_default_object_access_control.public_rule]
}

resource "google_storage_bucket_object" "models" {
  for_each    = fileset("${path.root}/../../server/static/training", "**")
  bucket      = google_storage_bucket.fmltc.name
  depends_on  = [google_storage_default_object_access_control.public_rule]
  source      = "${path.root}/../../server/static/training/${each.key}"
  name        = "static/training/${each.key}"
}


