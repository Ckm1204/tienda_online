variable "aws_region" {
  type        = string
  description = "Región de AWS para producción"
  default     = "us-east-1"
}

variable "availability_zones" {
  type        = list(string)
  description = "Zonas de disponibilidad para red Multi-AZ"
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "cloudflare_api_token" {
  type        = string
  description = "API Token para configurar Cloudflare Edge WAF"
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Zone ID de Cloudflare para tienditaonline.co"
}
