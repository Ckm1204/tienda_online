# Módulo Terraform: VPC Privada y Red Multi-AZ para TienditaOnline
# HU-130, HU-408, HU-369

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

variable "environment" {
  type        = string
  description = "prod | staging"
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "availability_zones" {
  type    = list(string)
  default = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "tags" {
  type = map(string)
  default = {
    "cost-center" = "tiendita-core"
    "service"     = "network"
    "env"         = "prod"
    "managed-by"  = "terraform"
  }
}

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name = "tiendita-${var.environment}-vpc"
  })
}

# Subredes Públicas (Ingress ALB / NAT Gateways)
resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name = "tiendita-${var.environment}-public-${var.availability_zones[count.index]}"
    Tier = "public"
  })
}

# Subredes Privadas de Aplicación (Microservicios ECS/EKS)
resource "aws_subnet" "app_private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "tiendita-${var.environment}-app-private-${var.availability_zones[count.index]}"
    Tier = "app-private"
  })
}

# Subredes Aisladas de Datos (Aurora PostgreSQL, Redpanda, Redis - SIN salida a internet)
resource "aws_subnet" "data_isolated" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8)
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name = "tiendita-${var.environment}-data-isolated-${var.availability_zones[count.index]}"
    Tier = "data-isolated"
  })
}

# VPC Endpoints para servicios AWS sin salir por NAT Gateway (S3, KMS, Secrets Manager, ECR)
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.us-east-1.s3"
  vpc_endpoint_type = "Gateway"
  tags              = var.tags
}

resource "aws_vpc_endpoint" "kms" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.us-east-1.kms"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.app_private[*].id
  private_dns_enabled = true
  tags                = var.tags
}

resource "aws_vpc_endpoint" "secretsmanager" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.us-east-1.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.app_private[*].id
  private_dns_enabled = true
  tags                = var.tags
}

output "vpc_id" {
  value = aws_vpc.main.id
}
output "app_subnet_ids" {
  value = aws_subnet.app_private[*].id
}
output "data_subnet_ids" {
  value = aws_subnet.data_isolated[*].id
}
