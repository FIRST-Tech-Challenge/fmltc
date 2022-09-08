
resource "google_storage_bucket" "fmltc" {
  name          = var.project_id
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-blobs" {
  name          = "${var.project_id}-blobs"
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
  name          = "${var.project_id}-action-parameters"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-gcf-source" {
  name          = "${var.project_id}-gcf-source"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket" "fmltc-gae-source" {
  name          = "${var.project_id}-gae-source"
  location      = "US"
  force_destroy = true
  depends_on = [google_project_service.gcp_services]
}

resource "google_storage_bucket_object" "with_support_from_google_cloud" {
  name         = "static/WithSupportFromGoogleCloud.png"
  source       = "${path.root}/../../server/static/WithSupportFromGoogleCloud.png"
  content_type = "image/png"
  bucket       = google_storage_bucket.fmltc.name
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
  content_type = "text/javascript"
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


