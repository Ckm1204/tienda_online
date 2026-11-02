# Módulo Terraform: Cloudflare Edge WAF, OWASP CRS, Bot Management y Authenticated Origin Pulls
# HU-130, HU-412, HU-372

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }
}

variable "zone_id" { type = string }
variable "domain" {
  type    = string
  default = "tienditaonline.co"
}
variable "origin_alb_hostname" { type = string }

# Configuración TLS 1.3 estricta y HSTS
resource "cloudflare_zone_settings_override" "tls_security" {
  zone_id = var.zone_id
  settings {
    ssl                      = "strict"
    min_tls_version          = "1.3"
    always_use_https         = "on"
    security_headers {
      strict_transport_security {
        enabled            = true
        max_age            = 63072000 # 2 años
        include_subdomains = true
        preload            = true
      }
    }
  }
}

# Authenticated Origin Pulls (solo peticiones firmadas por la CA de Cloudflare entran al ALB)
resource "cloudflare_authenticated_origin_pulls" "origin_auth" {
  zone_id = var.zone_id
  enabled = true
}

# Reglas WAF: OWASP Core Rule Set y Rate Limiting por endpoint crítico
resource "cloudflare_ruleset" "waf_owasp" {
  zone_id     = var.zone_id
  name        = "tiendita-waf-protection"
  description = "Reglas de protección OWASP, Sync Push y Activación Local"
  kind        = "zone"
  phase       = "http_request_firewall_managed"

  rules {
    action = "execute"
    action_parameters {
      id = "efb79d74999a4b4c801450e7ab0da0db" # OWASP Core Ruleset ID
    }
    expression  = "true"
    description = "Ejecutar OWASP Core Rule Set con umbral de anomalía"
    enabled     = true
  }

  rules {
    action = "block"
    expression = "(http.request.uri.path contains \"/v1/sync/push\" and rate(10s) > 100)"
    description = "Rate limit de emergencia en /v1/sync/push ante DDoS"
    enabled     = true
  }

  rules {
    action = "block"
    expression = "(http.request.uri.path contains \"/v1/local-activation/\" and ip.src.country ne \"CO\")"
    description = "Restringir activación local fuera de Colombia salvo lista blanca"
    enabled     = false # configurable
  }
}

output "zone_domain" {
  value = var.domain
}
