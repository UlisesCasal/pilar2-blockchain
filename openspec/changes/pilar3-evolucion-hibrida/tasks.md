# Tasks: Evolución a Arquitectura Híbrida (Pilar 3)

## Phase 1: Infrastructure Refactoring (GKE)

- [x] 1.1 Modificar `infra/gke/main.tf` para definir `infra-pool` y `app-pool`.
- [x] 1.2 Añadir `taints` al `infra-pool` y `tolerations` al `app-pool` en OpenTofu.
- [x] 1.3 Ejecutar `tofu apply` para migrar los pools de nodos actuales.

## Phase 2: Application Configuration (Helm)

- [x] 2.1 Modificar Helm charts (`deployment.yaml`) para añadir `nodeSelector` (app-pool) a todos los microservicios.
- [x] 2.2 Añadir `tolerations` a pods críticos de infraestructura para que toleren el taint del `infra-pool`.

## Phase 3: External GPU Workers

- [ ] 3.1 Crear `infra/gpu-vms/main.tf` para aprovisionar instancias de Compute Engine.
- [ ] 3.2 Crear script de configuración (`infra/gpu-vms/setup.sh`) para instalar binarios PoW.
- [ ] 3.3 Configurar Firewall de GCP para permitir tráfico a RabbitMQ.

## Phase 4: Verification

- [ ] 4.1 Verificar aislamiento de pods mediante `kubectl describe pod`.
- [ ] 4.2 Verificar conectividad de VMs GPU hacia RabbitMQ.
