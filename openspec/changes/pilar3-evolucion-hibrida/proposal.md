# Proposal: Evolución a Arquitectura Híbrida (Pilar 3)

## Intent
Evolucionar la arquitectura actual de Kubernetes hacia un modelo híbrido para optimizar recursos y permitir procesamiento intensivo en GPU. Separaremos las cargas de infraestructura de las aplicaciones mediante pools de nodos y externalizaremos los workers GPU.

## Scope

### In Scope
- Refactorización de `infra/gke/main.tf` para usar `infra-pool` y `app-pool` con `taints/tolerations`.
- Aprovisionamiento de VMs de Compute Engine (externas) para workers GPU.
- Configuración de seguridad (Firewall GCP) para comunicación híbrida.

### Out of Scope
- Migración completa de RabbitMQ fuera del clúster (se mantiene dentro por ahora).
- Implementación completa de auto-escalado (KEDA).

## Capabilities

### New Capabilities
- `node-pool-isolation`: Aislamiento físico de cargas de trabajo.
- `external-gpu-workers`: Instancias Compute Engine fuera de K8s.

### Modified Capabilities
- `k8s-manifests`: Actualización de despliegues para soportar `nodeSelector` y `tolerations`.

## Approach
1. **Infraestructura**: Modificar OpenTofu para separar nodegroups.
2. **Aplicación**: Añadir `nodeSelector` y `tolerations` en los Helm charts.
3. **GPU**: Script de aprovisionamiento de VMs externas + configuración de red.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `infra/gke/` | Modified | Separación en dos nodegroups. |
| `charts/blockchain/` | Modified | Añadir node affinity/tolerations. |
| `infra/gpu-vms/` | New | Aprovisionamiento de nodos externos. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Complejidad de red | Med | Firewall reglas explícitas. |
| Desbalanceo de recursos | Med | Monitoreo de uso. |

## Rollback Plan
- Revertir commits en OpenTofu y Helm charts.

## Dependencies
- GCP Project with quota for GPU instances.

## Success Criteria
- [ ] Pods de infra/app ejecutándose en nodos segregados.
- [ ] VMs externas conectadas a RabbitMQ.
