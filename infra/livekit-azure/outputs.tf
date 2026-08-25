output "livekit_public_ip" {
  value       = azurerm_public_ip.this.ip_address
  description = "The VM's public IP. livekit_domain below is derived from this via sslip.io — no manual DNS record needed."
}

output "livekit_domain" {
  value = local.livekit_domain
}

output "livekit_ws_url" {
  value       = "wss://${local.livekit_domain}"
  description = "Use this as VITE_LIVEKIT_URL / LiveKitServerURL (Info.plist) / LIVEKIT_URL (CallForegroundService.kt) in the clients."
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
