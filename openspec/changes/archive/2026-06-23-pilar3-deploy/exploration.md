## Exploration: Pilar 3 - Kubernetes Deployment on GKE

### Current State
The project uses `docker-compose.yml` to orchestrate services (`rabbitmq`, `redis`, `validator`, `coordinator`, `pool`, `worker`, `frontend`). Recent updates added authentication middleware and user login routes, which must be supported in the Kubernetes migration.

### Affected Areas
- Infrastructure orchestration: Migration to Kubernetes (K8s) manifests (deployments, services, configmaps, persistent volumes).
- CI/CD: Define Kubernetes deployment pipelines.
- Infrastructure-as-Code: Provision GKE cluster via OpenTofu (OT).

### Approaches
1. **Full Migration to K8s Manifests** — Manually define K8s manifests for all services.
   - Pros: Maximum control, standard K8s practices.
   - Cons: High effort.
2. **Helm Charts** — Package services into Helm charts.
   - Pros: Templating, easier deployment management, versioning (Recommended).
   - Cons: Adds complexity in chart maintenance.
3. **Kompose** — Automatic conversion.
   - Pros: Fast initial conversion.
   - Cons: Might need manual tuning.

### Recommendation
Use **Helm Charts** for maintainability and scalability in GKE. Use **OpenTofu** for cluster provisioning.

### Risks
- Complexity of networking between services in GKE vs Docker network bridge.
- Persistent volume management for RabbitMQ and Redis in K8s.
- Authentication integration (newly added) with ingress controllers.

### Ready for Proposal
Yes.
