# Módulo Terraform: Clúster Aurora PostgreSQL 16 Multi-AZ con pg_partman y cifrado KMS
# HU-130, HU-131, HU-409, HU-341

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
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "kms_key_arn" { type = string }
variable "tags" { type = map(string) }

resource "aws_db_subnet_group" "aurora" {
  name       = "tiendita-${var.environment}-aurora-subnets"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

resource "aws_rds_cluster_parameter_group" "aurora_pg16" {
  name        = "tiendita-${var.environment}-pg16-params"
  family      = "aurora-postgresql16"
  description = "Parameter group con extensiones pg_partman y rls para TienditaOnline"

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements,pg_partman_bgw"
  }

  parameter {
    name  = "pg_partman_bgw.dbname"
    value = "tiendita_prod"
  }

  parameter {
    name  = "pg_partman_bgw.interval"
    value = "3600"
  }

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = var.tags
}

resource "aws_rds_cluster" "aurora" {
  cluster_identifier              = "tiendita-${var.environment}-aurora"
  engine                          = "aurora-postgresql"
  engine_version                  = "16.1"
  database_name                   = "tiendita_prod"
  master_username                 = "postgres_admin"
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = var.kms_key_arn
  backup_retention_period         = 35 # HU-409: Backups automáticos de 35 días
  preferred_backup_window         = "03:00-04:00"
  storage_encrypted               = true
  kms_key_id                      = var.kms_key_arn
  db_subnet_group_name            = aws_db_subnet_group.aurora.name
  db_cluster_parameter_group_name = aws_rds_cluster_parameter_group.aurora_pg16.name
  deletion_protection             = true
  enabled_cloudwatch_logs_exports = ["postgresql"]

  tags = merge(var.tags, {
    "cost-center" = "tiendita-data"
    "service"     = "database"
  })
}

# Writer Instance (Primaria)
resource "aws_rds_cluster_instance" "writer" {
  identifier                  = "tiendita-${var.environment}-aurora-writer"
  cluster_identifier          = aws_rds_cluster.aurora.id
  instance_class              = "db.r6g.xlarge"
  engine                      = aws_rds_cluster.aurora.engine
  engine_version              = aws_rds_cluster.aurora.engine_version
  performance_insights_enabled = true
  monitoring_interval         = 30
  auto_minor_version_upgrade  = false
  tags                        = var.tags
}

# Reader Instance (Réplica de lectura Multi-AZ)
resource "aws_rds_cluster_instance" "reader" {
  identifier                  = "tiendita-${var.environment}-aurora-reader"
  cluster_identifier          = aws_rds_cluster.aurora.id
  instance_class              = "db.r6g.xlarge"
  engine                      = aws_rds_cluster.aurora.engine
  engine_version              = aws_rds_cluster.aurora.engine_version
  performance_insights_enabled = true
  monitoring_interval         = 30
  auto_minor_version_upgrade  = false
  tags                        = var.tags
}

output "cluster_endpoint" {
  value = aws_rds_cluster.aurora.endpoint
}
output "reader_endpoint" {
  value = aws_rds_cluster.aurora.reader_endpoint
}
