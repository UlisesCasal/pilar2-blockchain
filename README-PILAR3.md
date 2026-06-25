# README: Pilar 3 - Evolución a Arquitectura Híbrida

## 1. Visión General
El Pilar 3 migra la infraestructura de `docker-compose` a un modelo híbrido multi-cluster. El objetivo es separar la gestión de servicios críticos (RabbitMQ, Redis, Coordinador) de la carga intensiva de cómputo (Workers GPU), optimizando costos y rendimiento.

- **GKE (Google Kubernetes Engine)**: Servicios de aplicación y mensajería (RabbitMQ, Redis, Coordinator, Pool, Validator, Frontend) con HTTPS via cert-manager + Let's Encrypt.
- **Cluster externo k3s con GPUs NVIDIA**: Workers GPU con CUDA para minería de Proof-of-Work.

## 2. Arquitectura Modelo (Estado Híbrido)

```ascii
                    custody-chain.darwin-consulting.online
                                    |
                              (HTTPS/443)
                                    |
+-------------------------------------------------------+
| GKE Cluster (Namespace: prod)                         |
|                                                       |
| +-----------+  +----------------------------------+   |
| | Ingress   |->| cert-manager + Let's Encrypt     |   |
| | nginx     |  | (TLS automático)                 |   |
| +-----------+  +----------------------------------+   |
|       |                                               |
| +---------------------+      +---------------------+  |
| | infra-pool (Taints) |      | app-pool (Selector) |  |
| | +-----------------+ |      | +-----------------+ |  |
| | | RabbitMQ (LB)   | |      | | Frontend (nginx)| |  |
| | | Redis           | |      | | Coordinator     | |  |
| | +-----------------+ |      | | Pool / Validator| |  |
| +---------------------+      | +-----------------+ |  |
|                               +---------------------+  |
+-------------------------------------------------------+
           |
    (RABBITMQ_URL via LoadBalancer)
           |
+-------------------------------------------------------+
| Cluster k3s Externo (Namespace: g-amarillo)           |
|                                                       |
| +---------------------------------------------------+ |
| | knode04 — NVIDIA GeForce GTX 1050 (CUDA 12.2)     | |
| | +-----------------------------------------------+ | |
| | | gpu-worker (Deployment, replicas: 1)          | | |
| | | image: ulisescasal/blockchain-gpu-worker       | | |
| | | WORKER_TYPE=GPU, nvidia.com/gpu: 1            | | |
| | | strategy: Recreate (recurso GPU exclusivo)    | | |
| | +-----------------------------------------------+ | |
| +---------------------------------------------------+ |
+-------------------------------------------------------+
```

## 3. Estado Actual de la Implementación

### GKE (Servicios de aplicación)
- [x] **Cluster GKE**: Provisionado con OpenTofu, separado en `infra-pool` y `app-pool` mediante taints/tolerations.
- [x] **Helm Chart**: Todos los microservicios definidos y probados (Coordinator, Pool, Worker CPU, Validator, Frontend, RabbitMQ, Redis).
- [x] **RabbitMQ expuesto**: Service tipo LoadBalancer para conectividad con workers externos.
- [x] **HTTPS**: Ingress nginx + cert-manager + Let's Encrypt en `custody-chain.darwin-consulting.online`.
- [x] **Frontend corregido**: nginx.conf actualizado para K8s (DNS resolver y service names), fix `crypto.randomUUID` para HTTP.
- [x] **Coordinator corregido**: `POOL_URL` configurado para apuntar al service name correcto de K8s.
- **Estado actual**: GKE destruido para ahorrar cuota. Seguir la guía de despliegue para reactivar.

### Cluster Externo k3s (GPU Workers)
- [x] **GPU verificada**: NVIDIA GeForce GTX 1050, 4GB VRAM, CUDA 12.2, Driver 535.309.01, nodo `knode04`.
- [x] **Imagen Docker GPU**: `ulisescasal/blockchain-gpu-worker:latest` en Docker Hub.
- [x] **Compilación CUDA**: Binario `pow_gpu_range` compilado con `nvcc -O3 -arch=sm_61` (compute capability 6.1 para GTX 1050).
- [x] **Deployment aplicado**: Pod corriendo en namespace `g-amarillo`, GPU asignada (`nvidia.com/gpu: 1`).
- [x] **Fix de compatibilidad**: Output del binario CUDA ajustado para matchear el formato esperado por `miner.js`.
- [x] **Conectividad verificada**: GPU worker conectado a RabbitMQ de GKE, consumiendo cola `mining_tasks`.
- **Estado actual**: Worker GPU corriendo. Se reinicia automáticamente vía K8s. Espera reconexión cuando GKE esté activo.

### Pendientes generales
- [ ] **KEDA**: Auto-escalado basado en profundidad de cola de RabbitMQ.
- [ ] **CI/CD Pipelines**: Pipeline de deploy incompleto (falta auth GKE, build/push de imágenes).
- [ ] **Load Testing**: Matriz de pruebas (transacciones, dificultad, fragmentación, disponibilidad GPU).

## 4. Guía de Despliegue Completa (de cero a producción)

### Paso 1: Levantar GKE con OpenTofu

```bash
cd infra/gke/
tofu init
tofu apply -auto-approve
```

Obtener credenciales del cluster:
```bash
gcloud container clusters get-credentials blockchain-cluster \
  --zone us-central1-a --project proyectosdypp2026
```

Verificar nodos:
```bash
kubectl get nodes -o wide
# Esperado: 1 nodo infra-pool + 2 nodos app-pool
```

### Paso 2: Instalar cert-manager

```bash
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.17.2/cert-manager.yaml
kubectl wait --for=condition=Ready pod -l app.kubernetes.io/instance=cert-manager \
  -n cert-manager --timeout=120s
```

### Paso 3: Instalar Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace
```

Obtener la IP externa del ingress:
```bash
kubectl get svc ingress-nginx-controller -n ingress-nginx \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}'
```

Actualizar el registro DNS en Hostinger:
- **Tipo**: A
- **Nombre**: custody-chain
- **Valor**: la IP obtenida arriba
- **TTL**: 3600

### Paso 4: Deploy de la aplicación con Helm

```bash
helm upgrade --install blockchain ./charts/blockchain \
  --namespace prod --create-namespace
```

Verificar que todo esté corriendo:
```bash
kubectl get pods -n prod
# Esperado: coordinator, frontend, pool, validator, rabbitmq, redis — todos Running
```

### Paso 5: Obtener IP de RabbitMQ y conectar GPU Workers

```bash
# Obtener IP externa de RabbitMQ
RABBIT_IP=$(kubectl get svc rabbitmq -n prod \
  -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
echo "RabbitMQ IP: $RABBIT_IP"

# Actualizar GPU worker en cluster k3s
KUBECONFIG=~/.kube/gabriel.yaml kubectl set env deploy/gpu-worker \
  -n g-amarillo \
  RABBITMQ_URL="amqp://guest:guest@${RABBIT_IP}:5672"

# También actualizar el manifiesto para futuras aplicaciones
sed -i '' "s|amqp://guest:guest@.*:5672|amqp://guest:guest@${RABBIT_IP}:5672|" \
  infra/gpu-external/deployment.yaml
```

### Paso 6: Verificar conectividad end-to-end

```bash
# Frontend accesible via HTTPS
curl -sI https://custody-chain.darwin-consulting.online | head -5

# GPU worker conectado
KUBECONFIG=~/.kube/gabriel.yaml kubectl logs -n g-amarillo deploy/gpu-worker --tail=10
# Buscar: "Consuming mining_tasks"

# Pool ve al worker
kubectl exec -n prod deploy/blockchain-blockchain-frontend -- \
  wget -qO- http://blockchain-blockchain-pool-service:3001/scale/status
# Buscar: "gpu_workers":1
```

### Dar de baja GKE (ahorrar cuota)

Cuando termines de usar, destruir todo para no gastar:
```bash
# 1. Desinstalar Helm releases
helm uninstall ingress-nginx -n ingress-nginx
helm uninstall blockchain -n prod

# 2. Borrar namespaces
kubectl delete namespace ingress-nginx prod cert-manager --ignore-not-found

# 3. Destruir cluster con OpenTofu
cd infra/gke/
tofu destroy -auto-approve

# 4. Limpiar recursos huérfanos de GCP
gcloud compute forwarding-rules list --project proyectosdypp2026 --filter="name~k8s"
gcloud compute firewall-rules list --project proyectosdypp2026 --filter="name~k8s"
# Borrar los que aparezcan con: gcloud compute <tipo> delete <nombre> --quiet
```

El GPU worker en el cluster k3s sigue corriendo y se reconectará automáticamente cuando GKE vuelva a estar activo.

## 5. GPU Workers en Cluster Externo (k3s)

### Pre-requisitos del cluster
```bash
# Verificar GPU disponible
nvidia-smi

# Verificar NVIDIA device plugin
kubectl get daemonset -n kube-system | grep nvidia

# Si no está instalado:
kubectl apply -f https://raw.githubusercontent.com/NVIDIA/k8s-device-plugin/v0.14.1/nvidia-device-plugin.yml
```

### Build de la imagen GPU
```bash
docker buildx build --platform linux/amd64 \
  -f Dockerfile.gpu \
  -t ulisescasal/blockchain-gpu-worker:latest \
  --push .
```

El `Dockerfile.gpu` usa un build multi-stage:
1. **Stage builder**: Imagen `nvidia/cuda:12.2.0-devel-ubuntu22.04`, compila `pow_gpu_range.cu` con `nvcc -O3 -arch=sm_61`.
2. **Stage runtime**: Imagen `nvidia/cuda:12.2.0-runtime-ubuntu22.04`, instala Node.js 20, copia el binario compilado y el código del worker.

> **Nota sobre `-arch`**: `sm_61` es para GTX 1050 (Pascal). Ajustar según la GPU: `sm_70` (V100), `sm_75` (T4/RTX 2080), `sm_80` (A100), `sm_86` (RTX 3090), `sm_89` (RTX 4090). Verificar con: `nvidia-smi --query-gpu=compute_cap --format=csv`.

### Deploy en el cluster k3s
```bash
export KUBECONFIG=~/.kube/gabriel.yaml
kubectl apply -f infra/gpu-external/deployment.yaml
```

### Validar GPU workers
```bash
export KUBECONFIG=~/.kube/gabriel.yaml

# Estado del pod y nodo asignado
kubectl get pods -n g-amarillo -l app=gpu-worker -o wide

# Logs (buscar "Miner initialized" con type: GPU)
kubectl logs -n g-amarillo deploy/gpu-worker --tail=50

# GPU asignada
kubectl describe pod -n g-amarillo -l app=gpu-worker | grep -A2 "Limits"
```

### Escalado de GPU workers
El deployment usa `strategy: Recreate` porque solo hay 1 GPU por nodo. Para más workers, se necesitan más nodos con GPU en el cluster. Si el worker cae, Kubernetes lo reinicia automáticamente.

## 6. Fixes Aplicados

### Fix 1: Compatibilidad output CUDA
Se detectó que el output del binario GPU (`pow_gpu_range.cu`) no matcheaba lo que `worker/miner.js` espera parsear.

| | Formato anterior (GPU) | Formato CPU (esperado por miner.js) |
|---|---|---|
| Nonce | `Nonce            : 12345` | `Nonce:   12345` |
| Hash | `MD5 resultante   : abc...` | `Hash:     abc...` |
| Not found | Bloque decorativo multi-línea | `NOT FOUND` |

Se modificó el `printf` de `pow_gpu_range.cu` para emitir el mismo formato que el binario CPU.

### Fix 2: nginx.conf del frontend para K8s
El reverse proxy usaba `resolver 127.0.0.11` (DNS de Docker) y hostnames de Docker Compose (`coordinator`, `pool`). Se actualizó para usar los service names de Kubernetes (`blockchain-blockchain-coordinator-service`, `blockchain-blockchain-pool-service`).

### Fix 3: crypto.randomUUID en HTTP
`crypto.randomUUID()` solo funciona en contexto seguro (HTTPS). Se agregó fallback con `crypto.getRandomValues()` para compatibilidad HTTP.

### Fix 4: POOL_URL en Coordinator
El coordinator no tenía configurado `POOL_URL`, defaulteando a `http://pool:3001` (nombre Docker Compose). Se agregó el env var apuntando al service name correcto de K8s.

## 7. Estructura de Archivos del Pilar 3

```
infra/
├── gke/                    # OpenTofu para cluster GKE
│   ├── main.tf             # Cluster + node pools (infra-pool, app-pool)
│   ├── provider.tf         # Provider Google Cloud
│   └── outputs.tf          # Endpoint del cluster
├── gpu-vms/                # (Legacy) VMs GPU en GCP — no usado
│   ├── main.tf
│   └── setup.sh
└── gpu-external/           # Deploy de GPU workers en cluster externo
    └── deployment.yaml     # Deployment con nvidia.com/gpu: 1, strategy: Recreate

charts/blockchain/          # Helm chart para GKE
├── Chart.yaml
├── values.yaml
└── templates/
    ├── cluster-issuer.yaml # Let's Encrypt ClusterIssuer
    ├── ingress/
    │   └── ingress.yaml    # Ingress TLS para custody-chain.darwin-consulting.online
    ├── coordinator/        # + POOL_URL env var
    ├── frontend/           # nginx reverse proxy corregido para K8s
    ├── pool/
    ├── worker/             # Workers CPU en GKE
    ├── validator/
    ├── rabbitmq/           # Service tipo LoadBalancer
    └── redis/

Dockerfile.gpu              # Multi-stage build para GPU workers (CUDA + Node.js)
frontend/
├── nginx.conf              # Reverse proxy corregido (service names K8s)
└── Dockerfile              # Build frontend + nginx
ci/k8s-deploy.yml           # GitHub Actions (incompleto)
```

## 8. Dominio y HTTPS

- **Dominio**: `custody-chain.darwin-consulting.online`
- **DNS**: Registro A en Hostinger apuntando a la IP del Ingress Controller
- **Certificado**: Let's Encrypt via cert-manager, renovación automática cada 60 días
- **Ingress**: nginx ingress controller con TLS termination

## 9. Problemas Detectados (Known Issues)

1. **IP dinámica de RabbitMQ**: Cada vez que se recrea el cluster GKE, RabbitMQ obtiene una nueva IP. Hay que actualizar `RABBITMQ_URL` en el GPU worker del cluster k3s.
2. **IP dinámica del Ingress**: El Ingress Controller también obtiene IP nueva. Hay que actualizar el registro A en Hostinger.
3. **CI/CD incompleto**: El pipeline `ci/k8s-deploy.yml` no tiene autenticación a GKE ni step de build/push de imágenes Docker.
4. **Credenciales RabbitMQ**: Usar `guest:guest` es inseguro. Considerar secretos de Kubernetes.
5. **Workers CPU en Helm**: El Helm chart tiene workers CPU con `replicas: 2`. Al hacer `helm upgrade` se reactivan. Escalarlos a 0 manualmente si se quiere usar solo GPU.
