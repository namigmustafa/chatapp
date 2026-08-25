variable "location" {
  description = "Azure region. Keep in EU (Zone 1 bandwidth pricing + data residency) unless you have a reason not to."
  type        = string
  default     = "westeurope"
}

variable "resource_group_name" {
  type    = string
  default = "rg-chatapp-livekit"
}

variable "vm_size" {
  description = "Standard_B2s (2 vCPU / 4GB) is sized for audio-only SFU load at ~10k users / 20min-avg per month. Bump to B2ms or D-series if you add video or see sustained CPU >60%."
  type        = string
  default     = "Standard_B2s"
}

variable "admin_username" {
  type    = string
  default = "livekitadmin"
}

variable "admin_ssh_public_key" {
  description = "Your SSH public key (contents of e.g. ~/.ssh/id_ed25519.pub). Required — no password auth is configured."
  type        = string
}

variable "admin_ip_cidr" {
  description = "CIDR allowed to SSH in (port 22). Least-privilege: use your own IP + /32, e.g. \"203.0.113.4/32\". Do NOT leave this as 0.0.0.0/0."
  type        = string
}

variable "acme_email" {
  description = "Email used for Let's Encrypt certificate registration/expiry notices."
  type        = string
}

variable "rtc_port_range_start" {
  type    = number
  default = 50000
}

variable "rtc_port_range_end" {
  type    = number
  default = 51000 # narrower than LiveKit's default 60000 to reduce the open-UDP-range attack surface; raise if you see port exhaustion under load
}

variable "key_vault_name" {
  description = "Must be globally unique across Azure. Adjust before applying."
  type        = string
  default     = "kv-chatapp-livekit"
}

variable "tags" {
  type = map(string)
  default = {
    project = "chatapp"
    purpose = "self-hosted-livekit-sfu"
  }
}
