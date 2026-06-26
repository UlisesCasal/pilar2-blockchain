# Static IP reservada para el Ingress Controller (dominio custody-chain.darwin-consulting.online)
# Creada manualmente, la importamos al estado de tofu para gestionarla:
# tofu import google_compute_address.blockchain_ingress blockchain-ingress-ip
data "google_compute_address" "blockchain_ingress" {
  name = "blockchain-ingress-ip"
}

resource "google_container_cluster" "primary" {
  name     = "blockchain-cluster"
  location = "us-central1-a"

  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = false
}

resource "google_container_node_pool" "infra_nodes" {
  name       = "infra-pool"
  cluster    = google_container_cluster.primary.name
  location   = "us-central1-a"
  node_count = 1

  node_config {
    machine_type = "e2-medium"
    disk_type    = "pd-standard"
    disk_size_gb = 50
    taint {
      key    = "role"
      value  = "infra"
      effect = "NO_SCHEDULE"
    }
  }
}

resource "google_container_node_pool" "app_nodes" {
  name       = "app-pool"
  cluster    = google_container_cluster.primary.name
  location   = "us-central1-a"
  node_count = 2

  node_config {
    machine_type = "e2-medium"
    disk_type    = "pd-standard"
    disk_size_gb = 50
  }
}
