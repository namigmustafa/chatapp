terraform {
  required_version = ">= 1.6.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.100"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {}

resource "azurerm_resource_group" "this" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

# ── Networking ───────────────────────────────────────────────────────────────

resource "azurerm_virtual_network" "this" {
  name                = "vnet-chatapp-livekit"
  address_space       = ["10.20.0.0/16"]
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = var.tags
}

resource "azurerm_subnet" "this" {
  name                 = "snet-livekit"
  resource_group_name  = azurerm_resource_group.this.name
  virtual_network_name = azurerm_virtual_network.this.name
  address_prefixes     = ["10.20.1.0/24"]
}

resource "azurerm_public_ip" "this" {
  name                = "pip-livekit"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = var.tags
}

# POC/test setup: derive the LiveKit domain from sslip.io instead of requiring
# a real registered domain + manual DNS record. <ip-with-dashes>.sslip.io
# resolves to that literal IP, which is enough for Caddy to issue a Let's
# Encrypt cert against — Terraform sequences public IP creation before the VM
# automatically since custom_data depends on this value transitively.
locals {
  livekit_domain = "${replace(azurerm_public_ip.this.ip_address, ".", "-")}.sslip.io"
}

# Least-privilege NSG: SSH is locked to admin_ip_cidr only. 80/443 and the RTC
# media range must stay open to the whole internet — that's inherent to a
# public signaling+media server, not a scoping mistake.
resource "azurerm_network_security_group" "this" {
  name                = "nsg-livekit"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = var.tags

  security_rule {
    name                       = "AllowSSHFromAdmin"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "22"
    source_address_prefix      = var.admin_ip_cidr
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTPForACMEChallenge"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTPSSignaling"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowRTCMediaUDP"
    priority                   = 130
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "${var.rtc_port_range_start}-${var.rtc_port_range_end}"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowRTCTCPFallback"
    priority                   = 140
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "7881"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "this" {
  name                = "nic-livekit"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = var.tags

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.this.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.this.id
  }
}

resource "azurerm_network_interface_security_group_association" "this" {
  network_interface_id     = azurerm_network_interface.this.id
  network_security_group_id = azurerm_network_security_group.this.id
}

# ── Secrets ───────────────────────────────────────────────────────────────────
# LiveKit API key/secret are generated here and pushed to Key Vault as the
# source of truth. They are ALSO baked into the VM's cloud-init (see comment
# in outputs.tf) so the server can boot unattended — for a production/HR-data
# workload you'd instead give the VM a system-assigned managed identity and
# have cloud-init pull the secret from Key Vault at boot time, so nothing
# sensitive ever sits in Azure's stored custom_data. Flagging that tradeoff
# explicitly since this repo defaults to the simpler (less locked-down) path.

resource "random_password" "livekit_api_secret" {
  length  = 40
  special = false
}

resource "random_pet" "livekit_api_key" {
  prefix = "APIkey"
  length = 2
}

resource "azurerm_key_vault" "this" {
  name                       = var.key_vault_name
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  purge_protection_enabled   = true
  soft_delete_retention_days = 7
  tags                       = var.tags

  access_policy {
    tenant_id = data.azurerm_client_config.current.tenant_id
    object_id = data.azurerm_client_config.current.object_id

    secret_permissions = ["Get", "List", "Set", "Delete", "Purge"]
  }
}

resource "azurerm_key_vault_secret" "livekit_api_key" {
  name         = "livekit-api-key"
  value        = random_pet.livekit_api_key.id
  key_vault_id = azurerm_key_vault.this.id
}

resource "azurerm_key_vault_secret" "livekit_api_secret" {
  name         = "livekit-api-secret"
  value        = random_password.livekit_api_secret.result
  key_vault_id = azurerm_key_vault.this.id
}

# ── VM ────────────────────────────────────────────────────────────────────────

resource "azurerm_linux_virtual_machine" "this" {
  name                = "vm-livekit"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  size                = var.vm_size
  admin_username      = var.admin_username
  network_interface_ids = [azurerm_network_interface.this.id]
  tags                = var.tags

  disable_password_authentication = true
  admin_ssh_key {
    username   = var.admin_username
    public_key = var.admin_ssh_public_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "0001-com-ubuntu-server-jammy"
    sku       = "22_04-lts-gen2"
    version   = "latest"
  }

  custom_data = base64encode(templatefile("${path.module}/cloud-init.yaml.tftpl", {
    livekit_domain     = local.livekit_domain
    acme_email         = var.acme_email
    livekit_api_key    = random_pet.livekit_api_key.id
    livekit_api_secret = random_password.livekit_api_secret.result
    rtc_port_start     = var.rtc_port_range_start
    rtc_port_end       = var.rtc_port_range_end
  }))
}
