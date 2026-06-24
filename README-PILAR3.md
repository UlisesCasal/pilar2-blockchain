# README: Pilar 3 - Evolución a Arquitectura Híbrida

## 1. Visión General
El Pilar 3 migra la infraestructura de `docker-compose` a un modelo híbrido en Google Cloud Platform (GCP). El objetivo es separar la gestión de servicios críticos (RabbitMQ, Redis, Coordinador) de la carga intensiva de cómputo (Workers GPU), optimizando costos y rendimiento.

## 2. Arquitectura Modelo (Estado Híbrido)

```ascii
+-------------------------------------------------------+
| GKE Cluster (Namespace: prod)                         |
|                                                       |
| +---------------------+      +---------------------+  |
| | infra-pool (Taints) |      | app-pool (Selector) |  |
| | +-----------------+ |      | +-----------------+ |  |
| | | RabbitMQ / Redis| |      | | Frontend / Coord| |  |
| | +-----------------+ |      | +-----------------+ |  |
| +---------------------+      +---------------------+  |
+-------------------------------------------------------+
           |                                  |
    (Red Interna K8s)                 (Conectividad Externa)
           |                                  |
           |                          +-------+-------+
           |                          | External GPUs |
           +------------------------> | (Compute VMs) |
                                      +---------------+
```

## 3. Estado Actual de la Implementación
- [x] **Clúster GKE**: Provisionado con OpenTofu y separado en dos *Node Pools* (`infra-pool`, `app-pool`) mediante *taints* y *tolerations*.
- [x] **Microservicios**: Desplegados en GKE vía Helm (Validator, Coordinator, Pool, Worker, Frontend).
- [x] **Conectividad**: Todos los servicios en K8s funcionando (`Running`).
- [ ] **External GPU Workers**: Pendiente de aprovisionamiento (fallo por disponibilidad de zona en GCP).

## 4. Guía de Despliegue (Cómo levantar todo)

### A. Infraestructura GKE (OpenTofu)
Desde `infra/gke/`:
1. `tofu init`
2. `tofu apply -auto-approve` (Crea clúster con aislamiento de pools).

### B. Aplicación (Helm)
Desde la raíz del proyecto:
1. Asegurar que las variables de entorno en `charts/blockchain/values.yaml` apunten a los nombres de servicio de K8s.
2. `helm upgrade blockchain ./charts/blockchain --namespace prod`

### C. Workers GPU Externos (Compute Engine)
Desde `infra/gpu-vms/`:
1. `tofu init`
2. `tofu apply -auto-approve` (Este paso requiere resolver disponibilidad de stock GPU en GCP).

## 5. Tareas Pendientes
- [ ] **Completar aprovisionamiento de VMs GPU**: Resolver el error de disponibilidad de la zona `us-central1-a` rotando zonas.
- [ ] **Script de conexión**: Desarrollar el script de aprovisionamiento (`setup.sh`) para que las VMs GPU se registren automáticamente en el RabbitMQ del clúster.
- [ ] **KEDA**: Implementar el auto-escalado basado en eventos (profundidad de cola de RabbitMQ).

## 6. Problemas detectados (Known Issues)
1. **Recursos de GPU Agotados**: Google Cloud tiene stock limitado de `nvidia-tesla-t4`.
2. **Conectividad Híbrida**: RabbitMQ solo está expuesto dentro del clúster; se requerirá configuración adicional (LoadBalancer/VPN) para conectar los workers externos.
