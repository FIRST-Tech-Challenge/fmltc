module "dev" {
  source = "../core"

  credentials_file  = var.credentials_file
  project_id        = var.project_id
  region            = var.region
  app_engine_region = var.app_engine_region
  project_url       = var.project_url
  zone              = var.zone
}