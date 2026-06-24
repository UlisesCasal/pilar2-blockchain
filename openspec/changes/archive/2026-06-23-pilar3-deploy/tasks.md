# Tasks: Pilar 3 - Kubernetes Deployment on GKE

## Phase 1: Infrastructure (OpenTofu)

- [x] 1.1 Initialize `infra/gke/` directory for OpenTofu.
- [x] 1.2 Define `provider.tf` for Google Cloud.
- [x] 1.3 Define `main.tf` to create GKE cluster with 3 nodegroups.
- [x] 1.4 Define `outputs.tf` to export cluster credentials.

## Phase 2: Application Packaging (Helm)

- [x] 2.1 Create `charts/blockchain/` structure.
- [x] 2.2 Create `charts/blockchain/values.yaml` for default configurations.
- [x] 2.3 Create base chart templates for all microservices (`validator`, `coordinator`, `pool`, `worker`, `frontend`).
- [x] 2.4 Configure liveness/readiness probes in Helm charts.
- [x] 2.5 Configure environment variables mapping for all services in Helm.

## Phase 3: Integration & CI/CD

- [x] 3.1 Define Ingress controller configuration for Auth support.
- [x] 3.2 Create CI/CD workflow `ci/k8s-deploy.yml` for Helm deployment.

## Phase 4: Verification

- [x] 4.1 Dry-run Helm templates to verify configuration.
- [x] 4.2 Verify infrastructure deployment (gke-infrastructure spec).
- [ ] 4.3 Verify microservice connectivity and health (k8s-manifests spec).
- [ ] 4.4 Verify authentication flow via Ingress (auth-support spec).
