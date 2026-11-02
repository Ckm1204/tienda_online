# Módulo Terraform: Almacenamiento S3 Privado, Bloqueo Público y Cifrado KMS
# HU-130, HU-411, HU-341, HU-369

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
variable "tags" { type = map(string) }

# Llave KMS para Cifrado de Datos y Licencias
resource "aws_kms_key" "master" {
  description             = "KMS Master Key para cifrado de bases de datos, S3 y tokens de TienditaOnline"
  deletion_window_in_days = 30
  enable_key_rotation     = true # HU-341: Rotación anual automática
  tags                    = var.tags
}

resource "aws_kms_alias" "master" {
  name          = "alias/tiendita-${var.environment}-master"
  target_key_id = aws_kms_key.master.key_id
}

locals {
  buckets = [
    "bootstrap",
    "exports",
    "billing-receipts",
    "audit-worm",
    "einvoicing-worm"
  ]
}

resource "aws_s3_bucket" "tiendita" {
  for_each      = toset(locals.buckets)
  bucket        = "tiendita-${var.environment}-${each.key}"
  force_destroy = false

  tags = merge(var.tags, {
    "cost-center" = "tiendita-storage"
    "service"     = "s3-${each.key}"
  })
}

# Bloqueo total de acceso público en todos los buckets
resource "aws_s3_bucket_public_access_block" "block_public" {
  for_each                = aws_s3_bucket.tiendita
  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Cifrado obligatorio en reposo con KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "kms_enc" {
  for_each = aws_s3_bucket.tiendita
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.master.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

# S3 Object Lock en modo COMPLIANCE por 10 años para WORM (Auditoría y Facturación DIAN)
resource "aws_s3_bucket_object_lock_configuration" "worm_lock" {
  for_each = toset(["audit-worm", "einvoicing-worm"])
  bucket   = aws_s3_bucket.tiendita[each.key].id

  rule {
    default_retention {
      mode  = "COMPLIANCE"
      years = 10
    }
  }
}

# Ciclo de vida hacia Glacier para buckets de exportaciones y respaldos
resource "aws_s3_bucket_lifecycle_configuration" "glacier_archive" {
  for_each = toset(["exports", "billing-receipts"])
  bucket   = aws_s3_bucket.tiendita[each.key].id

  rule {
    id     = "archive-to-glacier"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "GLACIER"
    }
  }
}

output "kms_key_arn" {
  value = aws_kms_key.master.arn
}
output "bucket_names" {
  value = { for k, v in aws_s3_bucket.tiendita : k => v.id }
}
