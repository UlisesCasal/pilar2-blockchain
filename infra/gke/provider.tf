terraform {
  required_providers {
    google = {
      source = "hashicorp/google"
      version = ">= 4.0"
    }
  }
}

provider "google" {
  project = "proyectosdypp2026"
  region  = "us-central1"
}
