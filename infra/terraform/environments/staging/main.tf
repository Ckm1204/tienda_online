# Infraestructura de Staging: TienditaOnline
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
      Environment = "staging"
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
  environment        = "staging"
  vpc_cidr           = "10.1.0.0/16"
  availability_zones = var.availability_zones
  tags = {
    Environment = "staging"
    Project     = "tienditaonline"
  }
}

module "storage_kms" {
  source      = "../../modules/storage_kms"
  environment = "staging"
  tags = {
    Environment = "staging"
    Project     = "tienditaonline"
  }
}

module "database" {
  source      = "../../modules/database"
  environment = "staging"
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.data_subnet_ids
  kms_key_arn = module.storage_kms.kms_key_arn
  tags = {
    Environment = "staging"
    Project     = "tienditaonline"
  }
}

module "messaging_cache" {
  source      = "../../modules/messaging_cache"
  environment = "staging"
  subnet_ids  = module.network.data_subnet_ids
  kms_key_arn = module.storage_kms.kms_key_arn
  tags = {
    Environment = "staging"
    Project     = "tienditaonline"
  }
}

module "edge_cloudflare" {
  source              = "../../modules/edge_cloudflare"
  zone_id             = var.cloudflare_zone_id
  domain              = "staging.tienditaonline.co"
  origin_alb_hostname = "staging-alb.tienditaonline.co"
}
