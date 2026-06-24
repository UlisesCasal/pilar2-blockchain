resource "google_compute_instance" "gpu_worker" {
  count        = 3
  name         = "gpu-worker-${count.index}"
  project      = "proyectosdypp2026"
  machine_type = "n1-standard-4"
  zone         = "us-central1-a"

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
    }
  }

  network_interface {
    network = "default"
    access_config {
      # Ephemeral IP
    }
  }

  guest_accelerator {
    type  = "nvidia-tesla-t4"
    count = 1
  }

  scheduling {
    on_host_maintenance = "TERMINATE"
  }

  metadata_startup_script = file("setup.sh")

  service_account {
    scopes = ["cloud-platform"]
  }
}
