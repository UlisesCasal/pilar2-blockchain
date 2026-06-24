# Design: Evolución a Arquitectura Híbrida (Pilar 3)

## Technical Approach
Refactorizar la infraestructura de GKE para segregar cargas mediante Node Pools con taints y tolerations. Aprovisionar nodos externos para computación intensiva (GPU) usando Compute Engine y exponer RabbitMQ para comunicación híbrida.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
| :--- | :--- | :--- | :--- |
| Node Isolation | Taints/Tolerations | Namespace isolation | Permite compartir clúster con aislamiento de recursos. |
| GPU Workers | Compute Engine VMs | K8s GPU Nodes | Menor costo en GCP comparado con nodos GPU GKE. |
| Hybrid Networking | External LoadBalancer | VPN/Interconnect | Acceso público seguro a RabbitMQ para los workers externos. |

## Data Flow
```
External GPU Workers ──→ External LoadBalancer ──→ RabbitMQ (K8s)
    (Minado PoW)                                       │
                                                  Coordinator
```

## File Changes

| File | Action | Description |
| :--- | :--- | :--- |
| `infra/gke/main.tf` | Modify | Definir `infra-pool` y `app-pool`. |
| `infra/gpu-vms/main.tf`| Create | Aprovisionamiento de VMs de Compute Engine. |
| `charts/blockchain/` | Modify | Añadir `tolerations` y `nodeSelector` a Deployments. |

## Interfaces / Contracts
Las VMs de GPU externas se comunicarán con el servicio de RabbitMQ mediante una IP externa o LoadBalancer expuesto por el clúster.

## Testing Strategy

| Layer | What to Test | Approach |
| :--- | :--- | :--- |
| Integration | Aislamiento | Verificar que los pods `infra` están en los nodos correctos. |
| Integration | Híbrido | Verificar conectividad de VM externa hacia RabbitMQ. |

## Migration / Rollout
Se aplicarán primero los cambios en el clúster (taints), luego se desplegarán las VMs externas.

## Open Questions
- [ ] Definir el tipo de máquina específica para los nodos GPU.
- [ ] Seguridad: ¿Qué políticas de firewall son estrictamente necesarias?
