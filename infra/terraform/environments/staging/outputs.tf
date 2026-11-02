output "vpc_id" {
  value = module.network.vpc_id
}

output "aurora_cluster_endpoint" {
  value = module.database.cluster_endpoint
}

output "redis_primary_endpoint" {
  value = module.messaging_cache.redis_primary_endpoint
}

output "kms_master_key_arn" {
  value = module.storage_kms.kms_key_arn
}
