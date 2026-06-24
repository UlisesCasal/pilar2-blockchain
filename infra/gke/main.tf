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
