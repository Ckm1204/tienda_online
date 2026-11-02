# Módulo Terraform: Mensajería (Redpanda/MSK) y Caché Distribuido (Redis 7 Multi-AZ)
# HU-130, HU-410, HU-369

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" { type = string }
variable "subnet_ids" { type = list(string) }
variable "kms_key_arn" { type = string }
variable "tags" { type = map(string) }

# Clúster ElastiCache Redis 7 Multi-AZ
resource "aws_elasticache_subnet_group" "redis" {
  name       = "tiendita-${var.environment}-redis-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "tiendita-${var.environment}-redis"
  description                = "Redis 7 Multi-AZ para rate limiting, report-cache e idempotencia"
  node_type                  = "cache.m6g.large"
  port                       = 6379
  parameter_group_name       = "default.redis7.cluster.on"
  automatic_failover_enabled = true
  multi_az_enabled           = true
  num_node_groups            = 2
  replicas_per_node_group    = 1
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  kms_key_id                 = var.kms_key_arn

  tags = merge(var.tags, {
    "cost-center" = "tiendita-cache"
    "service"     = "redis"
  })
}

# Configuración Redpanda / Amazon MSK
resource "aws_msk_cluster" "kafka" {
  cluster_name           = "tiendita-${var.environment}-events"
  kafka_version          = "3.5.1"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = var.subnet_ids
    security_groups = []
    storage_info {
      ebs_storage_info {
        volume_size = 500
      }
    }
  }

  encryption_info {
    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
    encryption_at_rest_kms_key_arn = var.kms_key_arn
  }

  client_authentication {
    sasl {
      iam   = true
      scram = false
    }
  }

  tags = merge(var.tags, {
    "cost-center" = "tiendita-messaging"
    "service"     = "kafka-redpanda"
  })
}

output "redis_primary_endpoint" {
  value = aws_elasticache_replication_group.redis.configuration_endpoint_address
}
output "msk_bootstrap_brokers_tls" {
  value = aws_msk_cluster.kafka.bootstrap_brokers_sasl_iam
}
