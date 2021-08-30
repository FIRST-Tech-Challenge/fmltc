module "dev" {
  source = "../core"

  credentials_file  = var.credentials_file
  project_name      = var.project_name
  project_id        = var.project_id
  region            = var.region
  app_engine_region = var.app_engine_region
  app_engine_url    = var.app_engine_url
  zone              = var.zone
}