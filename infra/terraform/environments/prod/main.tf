# Infraestructura de Producción: TienditaOnline
# Multi-AZ con pg_partman, MSK Kafka, Redis 7, S3 WORM 10 años y Cloudflare OWASP CRS
# HU-130, HU-408..HU-412

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Environment = "prod"
      Project     = "tienditaonline"
      ManagedBy   = "terraform"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

module "network" {
  source             = "../../modules/network"
  environment        = "prod"
  vpc_cidr           = "10.0.0.0/16"
  availability_zones = var.availability_zones
  tags = {
    Environment = "prod"
    Project     = "tienditaonline"
  }
}

module "storage_kms" {
  source      = "../../modules/storage_kms"
  environment = "prod"
  tags = {
    Environment = "prod"
    Project     = "tienditaonline"
  }
}

module "database" {
  source      = "../../modules/database"
  environment = "prod"
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.data_subnet_ids
  kms_key_arn = module.storage_kms.kms_key_arn
  tags = {
    Environment = "prod"
    Project     = "tienditaonline"
  }
}

module "messaging_cache" {
  source      = "../../modules/messaging_cache"
  environment = "prod"
  subnet_ids  = module.network.data_subnet_ids
  kms_key_arn = module.storage_kms.kms_key_arn
  tags = {
    Environment = "prod"
    Project     = "tienditaonline"
  }
}

module "edge_cloudflare" {
  source              = "../../modules/edge_cloudflare"
  zone_id             = var.cloudflare_zone_id
  domain              = "tienditaonline.co"
  origin_alb_hostname = "prod-alb.tienditaonline.co"
}
