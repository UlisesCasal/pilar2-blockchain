# Design: Pilar 3 - Kubernetes Deployment on GKE

## Technical Approach
Implement infrastructure using OpenTofu to provision a GKE cluster. Application management will utilize Helm charts. Each service will be defined as a Deployment with appropriate replicas, environment variables, and liveness/readiness probes to maintain health, effectively translating the current `docker-compose` setup to Kubernetes primitives.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
| :--- | :--- | :--- | :--- |
| Infrastructure as Code | OpenTofu | Manual console/Terraform | Open Source, requested in requirements. |
| Application Packing | Helm | Raw YAML manifests | Templating, versioning, and lifecycle management. |
| Networking | K8s Services | Istio/Service Mesh | Standard K8s networking is sufficient for initial migration. |

## Data Flow
```
Client (Frontend) ──→ Ingress/Service ──→ Coordinator/Auth
                                           │
                                     RabbitMQ/Redis
                                           │
                                       Workers (POW)
```

## File Changes

| File | Action | Description |
| :--- | :--- | :--- |
| `infra/gke/main.tf` | Create | OpenTofu definitions for GKE cluster. |
| `charts/blockchain/` | Create | Helm charts for all services. |
| `ci/k8s-deploy.yml` | Create | CI/CD pipeline for K8s deployment. |

## Interfaces / Contracts
Environment variables mapped from `docker-compose.yml` must be preserved in Helm `values.yaml` files.

## Testing Strategy

| Layer | What to Test | Approach |
| :--- | :--- | :--- |
| Unit | Service configuration | Helm template dry-run. |
| Integration | Component connectivity | `k8s` service availability test. |
| E2E | Full flow | Deployment validation in GKE. |

## Migration / Rollout
Phased rollout starting with infrastructure provisioning, followed by service-by-service deployment.

## Open Questions
- [ ] Need to verify GKE quota limits for the free tier.
- [ ] Determine storage class for RabbitMQ and Redis persistence.
