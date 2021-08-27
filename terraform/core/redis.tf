resource "google_redis_instance" "redis" {
  name           = "ml-redis-instance"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region
  redis_version  = "REDIS_5_0"

  depends_on = [google_project_service.gcp_services]
}

output "host" {
 description = "Redis IP address"
 value = google_redis_instance.redis.host
}


