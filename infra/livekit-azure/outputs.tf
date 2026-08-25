output "livekit_public_ip" {
  value       = azurerm_public_ip.this.ip_address
  description = "Point your DNS A record (var.livekit_domain) at this IP before applying, or Caddy's ACME challenge will fail on first boot."
}

output "livekit_ws_url" {
  value       = "wss://${var.livekit_domain}"
  description = "Use this as the LiveKit server URL in the web/iOS/Android clients."
}

output "key_vault_name" {
  value = azurerm_key_vault.this.name
}

output "livekit_api_key_secret_name" {
  value       = azurerm_key_vault_secret.livekit_api_key.name
  description = "Fetch with: az keyvault secret show --vault-name <key_vault_name> --name livekit-api-key --query value -o tsv"
}

output "livekit_api_secret_secret_name" {
  value       = azurerm_key_vault_secret.livekit_api_secret.name
  sensitive   = true
  description = "Fetch with: az keyvault secret show --vault-name <key_vault_name> --name livekit-api-secret --query value -o tsv"
}
