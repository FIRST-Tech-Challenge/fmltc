resource "google_redis_instance" "ml-redis-dev" {
  name           = "ml-redis-vpc-dev"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
  redis_version  = "REDIS_5_0"

  authorized_network = "projects/ftc-ml-firstinspires-dev/global/networks/ml-redis-vpc-dev"

  depends_on = [google_project_service.gcp_services]
}

output "host" {
 description = "Redis IP address"
 value = google_redis_instance.ml-redis-dev.host
}


