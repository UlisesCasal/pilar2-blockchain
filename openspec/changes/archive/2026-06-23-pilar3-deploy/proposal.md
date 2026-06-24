# Proposal: Pilar 3 - Kubernetes Deployment on GKE

## Intent
Migrate the `docker-compose` blockchain infrastructure to a production-ready Kubernetes environment on Google Cloud (GKE) to improve scalability, reliability, and management, ensuring compatibility with new authentication/login features.

## Scope

### In Scope
- Provision GKE cluster via OpenTofu.
- Create Helm charts for all services.
- Configure K8s namespaces, services, deployments, and ingress for authentication support.
- Setup CI/CD for Kubernetes.

### Out of Scope
- Migrating database data.
- Refactoring core code beyond K8s configuration.

## Capabilities

### New Capabilities
- `gke-infrastructure`: OpenTofu for GKE.
- `k8s-manifests`: Helm charts.

### Modified Capabilities
- `auth-support`: Ingress configuration to support authentication routes.

## Approach
1. **Provisioning**: OpenTofu modules for GKE.
2. **Packaging**: Helm charts, translating environment variables.
3. **Deployment**: CI/CD integration.

## Affected Areas
- Infrastructure: New OpenTofu scripts.
- Services: New Helm charts, Ingress configuration for Auth.

## Risks
- Cost (GKE).
- Networking (Ingress/Auth integration).
- Persistence (PVs for RMQ/Redis).

## Rollback Plan
- `tofu destroy`.
- `helm rollback`.

## Dependencies
- Google Cloud billing.
- OpenTofu installed.

## Success Criteria
- [ ] GKE cluster provisioned.
- [ ] Microservices deployed.
- [ ] `rabbitmq`/`redis` healthy.
- [ ] Frontend accessible via Ingress with Auth support.
