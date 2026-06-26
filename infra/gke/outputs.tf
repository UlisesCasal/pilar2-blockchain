output "cluster_endpoint" {
  value = google_container_cluster.primary.endpoint
}

output "ingress_static_ip" {
  value = data.google_compute_address.blockchain_ingress.address
}

output "ingress_static_ip_name" {
  value = data.google_compute_address.blockchain_ingress.name
}
