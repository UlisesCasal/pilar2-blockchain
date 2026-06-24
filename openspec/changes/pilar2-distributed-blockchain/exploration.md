## Exploration: Pilar 3 - Kubernetes Deployment on GKE

### Current State
The project currently uses `docker-compose.yml` to orchestrate multiple services: `rabbitmq`, `redis`, `validator`, `coordinator`, `pool`, `worker` (multiple replicas), and `frontend`.
Dependencies are managed via `depends_on` with `healthcheck` for `rabbitmq` and `redis`.
Environment configuration is handled via environment variables and volumes.

### Affected Areas
- Infrastructure orchestration: Moving from `docker-compose` to Kubernetes (K8s) manifests (deployments, services, configmaps, persistent volumes).
- CI/CD: Need to define Kubernetes deployment pipelines.
- Infrastructure-as-Code: Introduction of OpenTofu (OT) for GKE cluster provisioning.

### Approaches
1. **Full Migration to K8s Manifests** — Manually define K8s manifests for all services.
   - Pros: Maximum control, standard K8s practices.
   - Cons: High effort, steeper learning curve if K8s is new.
   - Effort: High

2. **Helm Charts** — Package services into Helm charts.
   - Pros: Templating, easier deployment management, versioning.
   - Cons: Adds complexity in chart maintenance.
   - Effort: Medium/High

3. **Kompose** — Use `kompose` to convert `docker-compose.yml` to K8s manifests automatically.
   - Pros: Fast initial conversion.
   - Cons: Generated manifests might need manual tuning for production readiness (e.g., resource requests/limits, ingress, storage classes).
   - Effort: Low

### Recommendation
Use **Helm Charts** for better maintainability and scalability in GKE. Use **OpenTofu** for cluster provisioning as requested.

### Risks
- Complexity of networking between services in GKE vs Docker network bridge.
- Persistent volume management for RabbitMQ and Redis in K8s.
- Resource constraints on the free GKE tier.

### Ready for Proposal
Yes. Orchestrator should proceed to proposal phase.
