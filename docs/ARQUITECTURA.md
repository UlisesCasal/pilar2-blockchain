# Arquitectura — Pilar 2: Blockchain de Custodia de Minerales

> Sistema distribuido de cadena de custodia para minerales, con minería Proof of Work,
> coordinación tolerante a fallos mediante elección de líder (Bully), y workers heterogéneos (CPU + GPU).

---

## Índice

1. [Visión General del Sistema](#1-visión-general-del-sistema)
2. [Componentes y Responsabilidades](#2-componentes-y-responsabilidades)
3. [Infraestructura de Mensajería (RabbitMQ / AMQP)](#3-infraestructura-de-mensajería-rabbitmq--amqp)
4. [Persistencia (Redis + SQLite)](#4-persistencia-redis--sqlite)
5. [Flujo de Datos Extremo a Extremo](#5-flujo-de-datos-extremo-a-extremo)
6. [Mecanismo de Consenso: Proof of Work](#6-mecanismo-de-consenso-proof-of-work)
7. [Tolerancia a Fallos: Algoritmo Bully](#7-tolerancia-a-fallos-algoritmo-bully)
8. [Modelo de Autenticación y Autorización](#8-modelo-de-autenticación-y-autorización)
9. [Cadena de Custodia](#9-cadena-de-custodia)
10. [Despliegue Local (Docker Compose)](#10-despliegue-local-docker-compose)
11. [Despliegue en Producción (GKE + Helm)](#11-despliegue-en-producción-gke--helm)
12. [Cluster GPU Externo (k3s)](#12-cluster-gpu-externo-k3s)
13. [Frontend Web (React + Vite + Nginx)](#13-frontend-web-react--vite--nginx)
14. [Pipeline CI/CD](#14-pipeline-cicd)
15. [Variables de Entorno](#15-variables-de-entorno)
16. [Diagrama de Arquitectura ASCII](#16-diagrama-de-arquitectura-completo)

---

## 1. Visión General del Sistema

**Pilar 2** es una blockchain privada para trazabilidad de minerales a lo largo de la cadena de suministro. Cada transacción representa la transferencia de custodia de un lote de mineral entre entidades de la industria minera argentina.

### Entidades del Dominio

| Entidad | Rol |
|---|---|
| Mina San Juan | Origen — extrae mineral CRUDO |
| Planta Neuquén | Procesa CRUDO → MINERAL |
| Refinería Bahía Blanca | Refina MINERAL |
| Terminal Puerto Rosario | Distribuye producto terminado |
| Operador Pozo Mendoza | Operador logístico |
| Impostor | Entidad de prueba (firma inválida) |

### Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Lenguaje | Node.js 20 (Alpine) |
| Framework web | Express.js |
| Mensajería | RabbitMQ 3.x (AMQP 0-9-1) |
| Base de datos en memoria | Redis 7 (AOF persistente) |
| Base de datos SQL | SQLite (better-sqlite3) |
| Autenticación | JWT + bcrypt |
| Minería PoW | MD5 + nonce |
| Minero CPU | Node.js (range scan) |
| Minero GPU | CUDA C++ (NVIDIA, sm_61) |
| Frontend | React 18 + Vite 5 + Nginx |
| Container | Docker + Docker Compose |
| Orquestación | Kubernetes (GKE) + Helm |
| CI/CD | GitHub Actions |
| Infraestructura | OpenTofu (Terraform) |
| GPU externa | k3s cluster independiente |

---

## 2. Componentes y Responsabilidades

### 2.1 Coordinator (`coordinator/`)

**Propósito**: Nodo central que mantiene la blockchain, coordina la minería y verifica resultados.

**Responsabilidades**:
- Mantener el estado de la blockchain en Redis
- Recibir solicitudes de minería del Pool y publicar tareas en RabbitMQ
- **Solo el líder** consume resultados de minería de `mining_results` y confirma bloques
- Verificar que el nonce cumple con la dificultad configurada (`md5(payload + nonce).startsWith(difficulty)`)
- Almacenar bloques confirmados en Redis
- Publicar eventos de bloque confirmado en el exchange fanout `block_confirmed`
- Proveer endpoints HTTP para consultar la chain, lotes, entidades y estado
- Firmar transacciones con clave privada de la entidad autenticada por JWT
- Responder a verificaciones de custodia (Pool consulta `GET /chain/lot/:lotId`)

**Endpoints HTTP**:

| Método | Ruta | Propósito | Auth |
|---|---|---|---|
| POST | `/mine` | Iniciar minería (lo llama el Pool) | No |
| POST | `/transaction` | Proxy a Pool | No |
| GET | `/status` | Health + rol (leader/follower) + longitud chain | No |
| GET | `/redis/status` | Estado de Redis | No |
| GET | `/rabbitmq/status` | Profundidad de cola mining_tasks | No |
| GET | `/chain` | Blockchain completa | No |
| GET | `/chain/:blockHash` | Bloque individual | No |
| GET | `/chain/lot/:lotId` | Transacciones por lote | No |
| GET | `/entities` | Listar entidades | No |
| POST | `/sign` | Firmar transacción con clave de entidad | JWT |
| POST | `/auth/login` | Login entidad → JWT | No |
| GET | `/auth/me` | Entidad desde token | JWT |

**Arranque**:
1. `initDB()` → crear SQLite con entidades y claves
2. Si chain vacía → crear bloque génesis: `md5('genesis')`
3. Crear `LeaderElection` (Bully algorithm)
4. Al ser electo → empezar a consumir `mining_results`
5. Al ser destituido → cancelar consumer
6. `consumeDLQ()` → loguear mensajes muertos
7. Iniciar Express en puerto 3000

### 2.2 Pool (`pool/`)

**Propósito**: Gateway de transacciones — recibe, valida, acumula y gatilla minería.

**Responsabilidades**:
- Validar transacciones entrantes (esquema + firma Ed25519)
- Verificar cadena de custodia contra la chain confirmada (consultando Coordinator) y contra el pool pendiente
- Acumular transacciones en un pool en memoria hasta alcanzar `BLOCK_THRESHOLD`
- Al alcanzar threshold: flushear el batch, construir payload canónico, dividir espacio de nonces, publicar tareas en `mining_tasks`
- Registrar workers vivos mediante keepalive queue (TTL 30s)
- Si no hay workers activos: publicar en `scale_requests`
- Auto-gatillar minería cuando un worker se reconecta y hay txs pendientes
- Suscribirse a `block_confirmed` para limpiar flag `_miningInProgress` y gatillar siguiente bloque

**Endpoints HTTP**:

| Método | Ruta | Propósito |
|---|---|---|
| POST | `/transaction` | Recibir transacción → validar → custody check → pool → minar si threshold |
| GET | `/pending` | Transacciones pendientes |
| GET | `/pending/lot/:lotId` | Pendientes filtradas por lote |
| POST | `/mine` | Forzar minería inmediata |
| GET | `/status` | Health + conteo workers GPU/CPU |
| GET | `/scale/status` | Info de escalado |

**Lógica de custody check**:
```
1. pool.findByLot(lotId) → si hay pendientes, último.destino debe coincidir con tx.origen
2. GET /chain/lot/:lotId → si hay en chain, último.destino debe coincidir con tx.origen
3. Si no hay registros → ok (primera transacción del lote)
```

### 2.3 Worker (`worker/`)

**Propósito**: Consumir tareas de minería y ejecutar Proof of Work.

**Responsabilidades**:
- Consumir mensajes de `mining_tasks` con `prefetch(1)` (un task a la vez)
- Ejecutar minero PoW: CPU (Node.js) o GPU (CUDA C++ compilado)
- Publicar resultado en `mining_results` con nonce encontrado (o `found: false`)
- Enviar heartbeat keepalive cada 10s a cola `keepalive`
- Exponer endpoint `/worker/status` para liveness

**Endpoints HTTP**:

| Método | Ruta | Propósito |
|---|---|---|
| GET | `/worker/status` | Health + worker_id + type + hash_rate |

### 2.4 Validator (`validator/`)

**Propósito**: Módulo de validación de transacciones (desacoplado como servicio HTTP).

**Responsabilidades**:
- Validar que todos los 8 campos requeridos (`id`, `id_lote`, `origen`, `destino`, `cantidad`, `tipo`, `timestamp`, `firma`) estén presentes
- Validar que `cantidad > 0`
- Validar que `tipo` sea `MINERAL` o `CRUDO`
- Validar que `origen !== destino`
- Verificar firma Ed25519 contra la clave pública de la entidad origen (salvo sentinel `__unsigned__`)

**NOTA**: El Validator existe como servicio standalone pero en la práctica `pool/index.js` importa `validateTransaction` directamente, sin llamar al microservicio.

---

## 3. Infraestructura de Mensajería (RabbitMQ / AMQP)

### 3.1 Conexión

- Protocolo: AMQP 0-9-1
- URL por defecto: `amqp://guest:guest@rabbitmq:5672`
- En producción (TLS): `amqps://guest:guest@rabbitmq:5671`
- Reconexión con backoff exponencial: 1s → 2s → 4s → 8s → 16s → 32s (6 intentos)
- Soporte TLS vía `RABBITMQ_CA`, `RABBITMQ_CERT`, `RABBITMQ_KEY`

### 3.2 Colas

| Cola | Tipo | Durable | TTL | DLX | Prefetch | Declarada por | Producen | Consumen |
|---|---|---|---|---|---|---|---|---|
| `mining_tasks` | Work Queue (Competing Consumers) | ✅ Sí | — | — | 1 | Coordinator, Pool, Worker | Pool, Coordinator | Workers |
| `mining_results` | Work Queue | ✅ Sí | — | `dlx_mining` | 1 | Coordinator, Worker | Workers | Coordinator (solo líder) |
| `mining_results_dlq` | Dead Letter Queue | ✅ Sí | — | — | — | Coordinator | — | Coordinator (solo logging) |
| `keepalive` | No durable | ❌ No | 30s | — | — | Coordinator, Pool, Worker | Workers | Pool |
| `scale_requests` | Durable | ✅ Sí | — | — | — | Pool | Pool | — (preparado para KEDA) |

### 3.3 Exchanges

| Exchange | Tipo | Durable | Declarado por | Bindings |
|---|---|---|---|---|
| `block_confirmed` | `fanout` | ❌ No | Coordinator, shared/amqp.js | Cada subscriber tiene cola exclusiva |
| `dlx_mining` | `direct` | ✅ Sí | Coordinator | `mining_results_dlq` binding sin routing key |

### 3.4 Patrones de Mensajería

#### Patrón 1: Work Queue / Competirng Consumers — mining_tasks

```
Pool ──PUBLISH──► mining_tasks ──CONSUME──► Worker 1
                  (durable)      ├──CONSUME──► Worker 2
                                 └──CONSUME──► Worker N
```

- Pool publica N tareas (una por rango de nonce)
- Workers consumen con `prefetch(1)` — cada worker toma una tarea a la vez
- Mensajes persistentes (sobreviven reinicios de RabbitMQ)
- ACK explícito: worker confirma solo después de publicar resultado

#### Patrón 2: Work Queue + DLX — mining_results

```
Worker ──PUBLISH──► mining_results ──CONSUME──► Coordinator (líder)
                   (DLX → dlx_mining)
                             │
                     nack sin requeue
                             ▼
                   mining_results_dlq ──CONSUME──► Coordinator (logging)
```

- Solo el líder consume de `mining_results`
- Si el handler falla (excepción), la cola envía el mensaje al DLX automáticamente
- El DLX lo redirige a `mining_results_dlq` para inspección

#### Patrón 3: Fanout / Pub-Sub — block_confirmed

```
Coordinator ──PUBLISH──► block_confirmed (fanout)
                               │
               ┌───────────────┼───────────────┐
               ▼               ▼               ▼
           Pool (sub)   Coord Follower    Coord Follower
           - flag=false   - notificación   - notificación
           - ¿más txs?    de consistencia  de consistencia
```

- Cada subscriber crea su propia cola exclusiva (`assertQueue('', { exclusive: true })`)
- Pool usa esto para saber cuándo liberar `_miningInProgress` y gatillar el siguiente bloque
- Followers coordinators reciben la notificación por consistencia de caché

#### Patrón 4: Keepalive (TTL-based)

```
Worker ──PUBLISH (c/10s)──► keepalive ──CONSUME──► Pool
                            TTL=30s
```

- Cola no durable: si RabbitMQ se reinicia, los keepalives se pierden (aceptable)
- TTL=30s: si un worker no envía heartbeat por 30s, su mensaje expira y es descartado
- Pool registra worker con timestamp y evicta si `lastSeen + TTL < now`
- Cuando `registry.count()` pasa de 0 a >0 con txs pendientes → auto-minería

---

## 4. Persistencia (Redis + SQLite)

### 4.1 Redis — Blockchain

**Propósito**: Almacenar la blockchain y locks atómicos.

| Key Pattern | Tipo | Comando | TTL | Propósito |
|---|---|---|---|---|
| `block:<block_hash>` | Hash | `HSET` | — | Datos del bloque (5 campos) |
| `chain` | List | `RPUSH` / `LRANGE` | — | Hashes ordenados de bloques |
| `leader:coordinator` | String | `SET EX` / `GET` | 15s | ID del líder actual |
| `lock:<prevHash>` | String | `SET NX EX` | 30s | Lock atómico de commit |

**Estructura de un bloque en Redis**:
```
HSET block:000048980b98addc5dbd60dc56ccceb6 \
  previous_hash "00000000000000000000000000000000" \
  nonce "0" \
  timestamp "2026-06-26T..." \
  transactions "[]" \
  block_hash "000048980b98addc5dbd60dc56ccceb6"

RPUSH chain 000048980b98addc5dbd60dc56ccceb6
```

**Lock atómico de commit** (previene doble escritura del mismo bloque):
```
SET lock:<prevHash> 1 NX EX 30
```
- `NX`: solo si no existe (primero en llegar gana)
- `EX 30`: expira en 30s (si el líder falla, el lock se libera solo)
- Si `lock < 0` (no adquirido): otro worker ya confirmó este bloque, descartar resultado

**Persistencia**: Redis con AOF (Append Only File) — `redis-server --appendonly yes`

### 4.2 SQLite — Autenticación

**Propósito**: Almacenar entidades, claves y contraseñas.

**Schema**:
```sql
CREATE TABLE entities (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT UNIQUE NOT NULL,        -- e.g. 'mina-san-juan'
  display_name  TEXT NOT NULL,               -- e.g. 'Mina San Juan'
  password_hash TEXT NOT NULL,               -- bcrypt de 'admin123'
  public_key    TEXT NOT NULL,               -- PEM Ed25519
  private_key   TEXT NOT NULL                -- PEM Ed25519
);
```

**Archivo**: `./data/auth.db` (configurable vía `DB_PATH`)

**Entidades seed** (6):
- mina-san-juan, planta-neuquen, refineria-bahia-blanca
- operador-pozo-mendoza, terminal-puerto-rosario, impostor
- Password por defecto: `admin123` (bcrypt, 10 rounds)

---

## 5. Flujo de Datos Extremo a Extremo

### 5.1 Envío de Transacción

```
Cliente/Frontend/Stress Test
  │
  ▼
POST /transaction ───► Pool (puerto 3001)
  │
  ├── (1) validateTransaction(tx)
  │       ├── ¿8 campos requeridos? (incluyendo firma)
  │       ├── ¿cantidad > 0?
  │       ├── ¿tipo in [MINERAL, CRUDO]?
  │       ├── ¿origen !== destino?
  │       └── ¿firma Ed25519 válida? (salvo '__unsigned__')
  │
  ├── (2) checkCustody(tx)
  │       ├── pool.findByLot(lotId) → último.destino === tx.origen?
  │       └── GET /chain/lot/:lotId (Coordinator) → último.destino === tx.origen?
  │       └── Si no → 403 Forbidden
  │
  ├── (3) pool.add(tx) → acumular en memoria
  │
  └── (4) ¿pool.size() >= BLOCK_THRESHOLD?
          ├── pool.flush() → batch de transacciones
          ├── GET /status (Coordinator) → obtener prevHash
          ├── split(workerCount) → dividir [0, MAX_SAFE_INTEGER] en N rangos
          ├── buildPayload(batch, prevHash) → string canónico
          └── Por cada rango:
                publish a mining_tasks {
                  task_id: uuid,
                  payload: "LOTE-001:mina->planta:100tn:0000...",
                  prev_hash: "0000...",
                  difficulty: "0000",
                  nonce_start: 0,
                  nonce_end: 4503599627370495,
                  transactions: [...]
                }
```

### 5.2 Minería

```
Worker consume mining_tasks (prefetch=1)
  │
  ├── CPU Worker:
  │     spawn node pow_cpu_range.js <payload> <difficulty> <start> <end>
  │     └── stdout: "Nonce: 12345\nHash: 0000abc..."
  │
  └── GPU Worker:
        spawn ./pow_gpu_range <payload> <difficulty> <start> <end>
        └── stdout: "Nonce: 67890\nHash: 0000def..."
  
  └── publish a mining_results {
        task_id, worker_id,
        found: true/false,
        nonce: "12345",
        hash: "0000abc...",
        payload, prev_hash, difficulty,
        transactions
      }
  
  └── ACK mensaje original de mining_tasks
```

### 5.3 Confirmación de Bloque (solo líder)

```
Coordinator LÍDER consume mining_results
  │
  ├── (NCT.2) ¿found === false? → descartar
  │
  ├── (NCT.3) acquireLock(prevHash)
  │       SET lock:<prevHash> 1 NX EX 30
  │       └── ¿false? → otro worker ganó, descartar
  │
  ├── (NCT.4) Verificar PoW
  │       md5(payload + nonce).startsWith(difficulty)
  │       └── ¿false? → nonce inválido, descartar
  │
  ├── buildBlock(task, nonce, hash) → objeto bloque
  │
  ├── storeBlock(block)
  │       HSET block:<hash> ...
  │       RPUSH chain <hash>
  │
  ├── publishBlockConfirmed(block)
  │       publish a block_confirmed (fanout)
  │
  └── Log "Block committed: 0000abc..."
```

### 5.4 Post-Confirmación

```
block_confirmed ──fanout──► Pool
                              │
                              ├── _miningInProgress = false
                              └── ¿pool aún tiene txs >= threshold?
                                    └── triggerMining(batch) → nuevo bloque

block_confirmed ──fanout──► Coordinator follower
                              └── notificación de nuevo bloque (consistencia)

Worker (separado):
  ──PUBLISH cada 10s──► keepalive ──CONSUME──► Pool
                                                └── registry.register(worker_id, type)
```

---

## 6. Mecanismo de Consenso: Proof of Work

### 6.1 Payload Canónico

**Transacción única**:
```
<id_lote>:<origen>-><destino>:<cantidad>tn:<prevHash>
Ej: "LOTE-2026-MIN-001:mina-san-juan->planta-neuquen:100tn:00000000000000000000000000000000"
```

**Múltiples transacciones** (batch):
```
<sorted-tx-ids-csv>:<prevHash>
Ej: "tx-001,tx-002,tx-003:00000000000000000000000000000000"
```

### 6.2 Algoritmo

```
hash = md5(payload + nonce)
resultado VÁLIDO si: hash.startsWith(DIFFICULTY)

Ej: DIFFICULTY = "0000"
    payload + "12345" → md5 → "0000a1b2c3d4e5f6..."
    ✅ VÁLIDO (empieza con 0000)
    
    payload + "99999" → md5 → "a1b2c3d4e5f60000..."
    ❌ INVÁLIDO (no empieza con 0000)
```

### 6.3 División del Espacio de Nonces

Todo worker recibe un rango disjunto y exclusivo:

```
MAX_NONCE = Number.MAX_SAFE_INTEGER = 9007199254740991

Con 2 workers:
  Worker 1: [0, 4503599627370495]
  Worker 2: [4503599627370496, 9007199254740991]

Con N workers:
  chunk = MAX_NONCE / N
  Worker i: [i * chunk, (i+1) * chunk - 1]
  Último worker: [i * chunk, MAX_NONCE]
```

### 6.4 Minero CPU

- **Binary**: `tpi/pilar1/Hit7/CPU/pow_cpu_range.js`
- **Ejecución**: `node pow_cpu_range.js <payload> <difficulty> <start> <end>`
- **Implementación**: Node.js, búsqueda secuencial en rango, MD5
- **Rendimiento**: ~70ms por búsqueda + ~200ms spawn overhead

### 6.5 Minero GPU

- **Binary**: `tpi/pilar1/Hit7/GPU/pow_gpu_range.cu`
- **Compilación**: `nvcc -O3 -arch=sm_61` (GTX 1050, Pascal, CUDA 12.2)
- **Ejecución**: `./pow_gpu_range <payload> <difficulty> <start> <end>`
- **Implementación**: CUDA C++ paralelo en GPU, miles de hilos simultáneos
- **Rendimiento**: Ordenes de magnitud más rápido que CPU por el paralelismo masivo
- **Arquitectura objetivo**: `sm_61` (GTX 1050)

### 6.6 Output Parseado

Ambos mineros producen el mismo formato de salida:

```
Prefix: 0000
Nonce:   12345
Prev_Hash: abc123...
Hash:     def456...
Time:   123.4567 ms
```

O si no encontró:
```
NOT FOUND
Time:   456.7890 ms
```

---

## 7. Tolerancia a Fallos: Algoritmo Bully

### 7.1 Descripción

Se implementa una elección de líder tipo **Bully** sobre Redis Pub/Sub para determinar qué instancia de Coordinator es la líder y debe consumir resultados de minería.

### 7.2 Identidad

Cada coordinator deriva un ID numérico:
```javascript
COORDINATOR_ID = Number(process.env.COORDINATOR_ID) || hashCode(hostname)
```
A mayor ID, mayor prioridad (el más grande gana).

### 7.3 Protocolo Completo

```
1. START: Cada coordinator arranca y consulta Redis
   ├── GET leader:coordinator
   │   ├── EXISTS → modo follower, poll cada 5s
   │   └── NOT FOUND → inicia elección

2. ELECTION:
   ├── PUBLISH election:start { id: <my_id> }
   ├── Espera 3s (ELECTION_TIMEOUT)
   │   ├── Si recibe election:answer de ID mayor → concede
   │   └── Si no recibe respuesta → se declara líder
   │
   ├── Al recibir election:start de ID menor:
   │   ├── PUBLISH election:answer { id: <my_id>, to: <their_id> }
   │   └── Inicia su propia elección (si no está en una)
   │
   └── Al recibir election:answer donde data.to === my_id y data.id > my_id:
       └── Marca electionAnswered = true → no se declara líder

3. VICTORY:
   ├── SET leader:coordinator <id> EX 15
   ├── PUBLISH election:victory { id: <my_id> }
   ├── Inicia heartbeat (renueva cada 5s)
   ├── Emite evento 'elected'
   │   └── Coordinator leader empieza a consumir mining_results
   └── Emite evento 'leader-changed'

4. DETECCIÓN DE CAÍDA:
   ├── Follower verifica leader:coordinator cada 5s
   │   ├── Si la clave expiró (TTL 15s, líder caído) → inicia nueva elección
   │   └── Si la clave sigue viva → líder ok
   │
   └── Líder renueva clave cada 5s
       ├── Si falla → clave expira → otro nodo inicia elección
       └── Si renueva con éxito → sigue siendo líder

5. TRANSICIÓN:
   ├── leader → follower:
   │   ├── Cancela heartbeat
   │   ├── Cancela consumer de mining_results
   │   └── Empieza a hacer poll como follower
   │
   └── follower → leader:
       ├── Inicia heartbeat
       ├── Empieza a consumir mining_results
       └── Emite 'elected'
```

### 7.4 Redis Keys para Elección

| Key | Tipo | TTL | Propósito |
|---|---|---|---|
| `leader:coordinator` | String | 15s | ID del líder actual |
| — | Pub/Sub | — | Canal `election:start` |
| — | Pub/Sub | — | Canal `election:answer` |
| — | Pub/Sub | — | Canal `election:victory` |

### 7.5 Propiedades

- **Tolerancia a particiones**: Si la red se divide, ambos lados eligen líder. Al sanar, el de mayor ID gana.
- **Split-brain prevention**: Solo el líder consume `mining_results`. Si hay dos líderes temporales, el lock atómico `SET NX EX` evita doble commit.
- **Failover**: <15s desde que el líder cae hasta que otro es electo.

---

## 8. Modelo de Autenticación y Autorización

### 8.1 JWT

- **Secreto**: `JWT_SECRET` (default: `pilar2-dev-secret` para desarrollo)
- **Expiración**: 24 horas
- **Payload**: `{ name: "mina-san-juan", displayName: "Mina San Juan" }`

### 8.2 Login

```
POST /auth/login
Body: { entity: "mina-san-juan", password: "admin123" }
Response: { token: "eyJ...", entity: { name: "mina-san-juan", displayName: "Mina San Juan" } }
```

### 8.3 Uso

- El endpoint `POST /sign` requiere JWT para firmar transacciones
- El JWT identifica qué entidad está autorizada a usar la clave privada
- Todas las demás rutas son públicas

### 8.4 Firma Ed25519

**Canonicalización** (campos firmados en orden):
```
{ id, id_lote, origen, destino, cantidad, tipo, timestamp }
```
`firma` está explícitamente excluida de la canonicalización.

**Verificación**:
```
publicKey = getPublicKey(tx.origen)
verifySignature(canonicalize(tx), tx.firma, publicKey)
```

**Sentinel de testing**: `firma: '__unsigned__'` salta verificación criptográfica.

---

## 9. Cadena de Custodia

### 9.1 Concepto

Cada lote de mineral (`id_lote`) tiene un dueño actual. Las transacciones solo son válidas si `origen` es el dueño actual del lote.

### 9.2 Reglas de Validación

```
Para tx con lotId = "LOTE-001":
  1. Buscar en pending pool: findByLot("LOTE-001")
     ├── Si hay pendientes: último.destino === tx.origen?
     │   ├── Sí → ok
     │   └── No → 403 Forbidden
     └── Si no hay pendientes → paso 2
     
  2. Consultar chain: GET /chain/lot/LOTE-001
     ├── Si hay registros: último.destino === tx.origen?
     │   ├── Sí → ok
     │   └── No → 403 Forbidden (holder actual: <último.destino>)
     └── Si no hay registros → ok (primera tx del lote)
```

### 9.3 Ciclo de Ejemplo

```
mina-san-juan → planta-neuquen → refineria-bahia-blanca → terminal-puerto-rosario → mina-san-juan → ...
```

Cada transacción mueve la custodia. El ciclo puede continuar indefinidamente.

---

## 10. Despliegue Local (Docker Compose)

### 10.1 Servicios

| Servicio | Imagen | Puertos | Réplicas | Depende de |
|---|---|---|---|---|
| `rabbitmq` | `rabbitmq:3-management` | 5672, 15672 | 1 | — |
| `redis` | `redis:7-alpine` | 6379 | 1 | — |
| `validator` | build local | — | 2 | — |
| `coordinator` | build local | — | 2 | rabbitmq (healthy), redis (healthy) |
| `pool` | build local | 3001 | 1 | rabbitmq (healthy), coordinator |
| `worker` | build local | — | 2 | rabbitmq (healthy), pool |
| `frontend` | build `./frontend` | 8080:80 | 1 | coordinator, pool |

### 10.2 Imagen Docker

**Dockerfile** (single image para todos los servicios):
```dockerfile
FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "entrypoint.js"]
```

**Entrypoint** selecciona servicio según `SERVICE` env var:
```javascript
const map = {
  coordinator: './coordinator/index.js',
  pool: './pool/index.js',
  worker: './worker/index.js',
  validator: './validator/server.js',
};
require(map[process.env.SERVICE]);
```

### 10.3 Red

- Network bridge única: `blockchain`
- Comunicación interna por nombre de servicio (Docker DNS)
- Solo `pool:3001` y `frontend:8080` expuestos al host

---

## 11. Despliegue en Producción (GKE + Helm)

### 11.1 Infraestructura (OpenTofu)

- **Cluster GKE**: 2 node pools
  - `infra-pool`: tainted `role=infra:NoSchedule` para RabbitMQ y Redis
  - `app-pool`: Coordinator, Pool, Worker, Validator, Frontend
- **GPU VMs** (legacy): 3× n1-standard-4 + nvidia-tesla-t4

### 11.2 Helm Chart (`charts/blockchain/`)

| Componente | Tipo | Réplicas | Node Pool | Puerto |
|---|---|---|---|---|
| Coordinator | Deployment | 1 (2 en compose) | app-pool | 3000 |
| Pool | Deployment | 1 | app-pool | 3001 |
| Worker | Deployment | HPA (1-10) | app-pool | 3002 |
| Validator | Deployment | 1 | app-pool | 3003 |
| Frontend | Deployment | 1 | app-pool | 80 |
| RabbitMQ | Deployment | 1 | infra-pool | 5672, 15672 |
| Redis | Deployment | 1 | infra-pool | 6379 |

### 11.3 Autoescalado (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 1
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

El HPA escala workers basado en CPU. Cuando hay muchas tareas de minería, el CPU sube y se crean más réplicas de worker automáticamente.

### 11.4 Ingress

```yaml
host: custody-chain.darwin-consulting.online
tls: Let's Encrypt (cert-manager)
backend: Frontend (puerto 80)
```

### 11.5 DNS

- **Dominio**: `custody-chain.darwin-consulting.online` (Hostinger)
- **Registro A**: apunta al Load Balancer IP del Ingress Controller NGINX
- **TLS**: cert-manager + Let's Encrypt (ClusterIssuer `letsencrypt-prod`)
  - HTTP-01 challenge con clase nginx
  - Renovación automática cada 60 días
  - Email: casalulises@gmail.com

---

## 12. Cluster GPU Externo (k3s)

### 12.1 Arquitectura

```
                    ┌─────────────────────────────────┐
                    │      GKE Cluster (GCP)           │
                    ├─────────────────────────────────┤
                    │  RabbitMQ: amqp://35.202.170.91  │
                    │  (expuesto como LoadBalancer)    │
                    └──────────────┬──────────────────┘
                                   │
                          Internet / WAN
                                   │
                    ┌──────────────▼──────────────────┐
                    │   k3s Cluster (GPU externo)      │
                    │   Namespace: g-amarillo          │
                    ├─────────────────────────────────┤
                    │  GPU Worker (1 pod)              │
                    │  ┌───────────────────────────┐   │
                    │  │ ulisescasal/blockchain-    │   │
                    │  │   gpu-worker:latest        │   │
                    │  │                           │   │
                    │  │ WORKER_TYPE=GPU            │   │
                    │  │ nvidia.com/gpu: 1          │   │
                    │  │ ┌─────────────────────┐   │   │
                    │  │ │ pow_gpu_range       │   │   │
                    │  │ │ (CUDA, sm_61)       │   │   │
                    │  │ │ GTX 1050, 4GB VRAM  │   │   │
                    │  │ └─────────────────────┘   │   │
                    │  └───────────────────────────┘   │
                    └──────────────────────────────────┘
```

### 12.2 Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: gpu-worker
  namespace: g-amarillo
spec:
  replicas: 1
  strategy:
    type: Recreate          # Sólo 1 pod por GPU
  template:
    spec:
      containers:
        - image: ulisescasal/blockchain-gpu-worker:latest
          env:
            - name: WORKER_TYPE
              value: "GPU"
            - name: RABBITMQ_URL
              value: "amqp://guest:guest@35.202.170.91:5672"
          resources:
            limits:
              nvidia.com/gpu: 1
```

### 12.3 Características

- **GPU**: 1× NVIDIA GTX 1050, 4GB VRAM, CUDA 12.2, Driver 535
- **Arquitectura CUDA**: `sm_61` (Pascal)
- **Estrategia**: `Recreate` — la GPU es exclusiva, no pueden correr 2 pods en la misma GPU
- **RabbitMQ**: se conecta al clúster GKE via LoadBalancer IP pública: `35.202.170.91:5672`
- **Imagen**: `ulisescasal/blockchain-gpu-worker:latest` en Docker Hub
  - Multi-stage build: compila `.cu` con `nvcc` en stage 1, runtime CUDA + Node.js en stage 2
  - Solo incluye `shared/`, `worker/`, `entrypoint.js` y el binario CUDA compilado
- **Namespace**: `g-amarillo` (cluster externo independiente)

### 12.4 Build de Imagen GPU (desde ARM Mac)

```bash
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile.gpu \
  -t ulisescasal/blockchain-gpu-worker:latest \
  --push .
```

---

## 13. Frontend Web (React + Vite + Nginx)

### 13.1 Stack

- **Framework**: React 18
- **Build tool**: Vite 5
- **CSS**: Tailwind CSS 3.4 + Lucide icons
- **Serve**: Nginx (multi-stage Docker build)

### 13.2 Vistas

| Vista | Archivo | Propósito |
|---|---|---|
| TransactionForm | `views/TransactionForm.jsx` | Pipeline 5 pasos: Complete → Sign → Pool → Mine → Confirm |
| BlockExplorer | `views/BlockExplorer.jsx` | Visualización SVG de la blockchain |
| CustodyTracker | `views/CustodyTracker.jsx` | Grafo dirigido de custodia + detección de desvío |
| MiningMonitor | `views/MiningMonitor.jsx` | Sala de control de minería (grid 2×2) |
| OverviewBar | `components/OverviewBar.jsx` | Barra de métricas en tiempo real |

### 13.3 API Client

```javascript
const COORDINATOR = '/api/coordinator';
const POOL = '/api/pool';

api.login(entity, password)
api.getStatus(), api.getChain(), api.getBlock(hash)
api.getLot(lotId), api.getEntities()
api.signTransaction(transaction)        // requiere JWT
api.submitTransaction(tx)
api.getPoolStatus(), api.getPending()
api.triggerMining()
api.getScaleStatus(), api.getRabbitStatus()
```

### 13.4 Nginx Proxy

```nginx
location /api/coordinator/ {
    rewrite ^/api/coordinator/(.*) /$1 break;
    proxy_pass http://coordinator:3000;
}
location /api/pool/ {
    rewrite ^/api/pool/(.*) /$1 break;
    proxy_pass http://pool:3001;
}
```

### 13.5 Desarrollo

Vite proxy: `/api/coordinator` → `http://localhost:3000`, `/api/pool` → `http://localhost:3001`

---

## 14. Pipeline CI/CD

### 14.1 GitHub Actions

```yaml
name: Deploy to GKE
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Helm Deploy
        run: helm upgrade --install blockchain ./charts/blockchain \
          --namespace prod --create-namespace
```

**Estado**: Incompleto — faltan pasos de autenticación GKE, build/push Docker, y manejo de tags de imagen.

---

## 15. Variables de Entorno

| Variable | Default | Usada por | Propósito |
|---|---|---|---|
| `SERVICE` | _(requerida)_ | entrypoint.js | Selección de servicio |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672` | coordinator, pool, worker, shared/amqp | Conexión RabbitMQ |
| `REDIS_URL` | `redis://redis:6379` | coordinator/redis, coordinator/leader-election | Conexión Redis |
| `BLOCK_THRESHOLD` | `1` | pool/index.js | Txs para gatillar minería |
| `DIFFICULTY` | `0000` | coordinator, pool | Dificultad PoW (ceros iniciales) |
| `KEEPALIVE_INTERVAL_MS` | `10000` | worker/index.js | Intervalo de heartbeat (ms) |
| `WORKER_TTL_MS` | `30000` | pool/index.js | TTL del registro de workers |
| `PORT_COORDINATOR` | `3000` | coordinator | Puerto HTTP |
| `PORT_POOL` | `3001` | pool | Puerto HTTP |
| `PORT_WORKER` | `3002` | worker | Puerto HTTP |
| `PORT_VALIDATOR` | `3003` | validator | Puerto HTTP |
| `PILAR1_CPU_BINARY` | `./tpi/pilar1/Hit7/CPU/pow_cpu_range.js` | worker/miner.js | Ruta minero CPU |
| `PILAR1_GPU_BINARY` | `./tpi/pilar1/Hit7/GPU/pow_gpu_range` | worker/miner.js | Ruta minero GPU |
| `COORDINATOR_URL` | `http://coordinator:3000` | pool | URL del Coordinator |
| `POOL_URL` | `http://pool:3001` | coordinator | URL del Pool |
| `WORKER_TYPE` | `CPU` | worker/consumer, worker/miner | Tipo de worker |
| `WORKER_ID` | UUID auto | worker/consumer | ID único del worker |
| `COORDINATOR_ID` | hash(hostname) | coordinator/leader-election | ID para elección Bully |
| `JWT_SECRET` | `pilar2-dev-secret` | coordinator | Secreto JWT |
| `DB_PATH` | `./data/auth.db` | coordinator/db.js | Ruta SQLite |
| `LOG_LEVEL` | `info` | shared/logger | Nivel de log |
| `RABBITMQ_CA` | — | coordinator/rabbitmq | Cert CA TLS |
| `RABBITMQ_CERT` | — | coordinator/rabbitmq | Cert cliente TLS |
| `RABBITMQ_KEY` | — | coordinator/rabbitmq | Key cliente TLS |

---

## 16. Diagrama de Arquitectura Completo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PILAR 2 — ARQUITECTURA COMPLETA                       │
└─────────────────────────────────────────────────────────────────────────────┘

USUARIOS / CLIENTES
┌──────────────────────────────────────────────────────────────────────────────┐
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────┐                       │
│  │   Frontend   │  │  Stress Test  │  │   Curl /    │                       │
│  │  React+Vite  │  │   script.js   │  │ Postman /   │                       │
│  │  :8080 (dev) │  │               │  │ scripts/    │                       │
│  └──────┬───────┘  └───────┬───────┘  └──────┬──────┘                       │
│         │                  │                  │                              │
│         ├──────────┬───────┴──────────────────┘                              │
│         │          │           POST /transaction                             │
└─────────┼──────────┼────────────────────────────────────────────────────────┘
          │          │
          ▼          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                            POOL (Express :3001)                              │
│                                                                              │
│  ┌─────────────┐  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │ validateTx() │  │   checkCustody()      │  │   transaction-pool.js     │  │
│  │ (schema +    │  │   ├─ pool.findByLot() │  │   (buffer en memoria)     │  │
│  │  Ed25519)    │  │   └─ GET /chain/lot/  │  │                           │  │
│  └──────┬───────┘  └──────────────────────┘  │   flush() cuando >=        │  │
│         │                                     │   BLOCK_THRESHOLD          │  │
│         └───────────┬─────────────────────────┘                           │  │
│                     │                                                     │  │
│                     ▼                                                     │  │
│           ┌───────────────────┐                                          │  │
│           │  triggerMining()  │────────────► POST /mine ──► Coordinator   │  │
│           │  (si no in-prog)  │  (HTTP)                                  │  │
│           └────────┬──────────┘                                          │  │
│                    │ fallback: publica directo                            │  │
│                    ▼                                                      │  │
│              rabbitmq.sendToQueue('mining_tasks', task)                   │  │
│                                                                              │
│  ┌─────────────────────────────────────────┐                                │
│  │ worker-registry.js                       │    ◄──── keepalive queue       │
│  │ Map<worker_id, {type, lastSeen}>         │       (TTL 30s)                │
│  │ auto-evict: Date.now() - lastSeen > TTL  │                               │
│  └─────────────────────────────────────────┘                                │
│                                                                              │
│  Suscripciones:                                                              │
│  ◄── block_confirmed (fanout) → _miningInProgress = false                   │
│  ◄── keepalive → registry.register(worker_id, type)                         │
└──────────────────────────────────────────────────────────────────────────────┘
         │                           ▲
         │ publica mining_tasks      │ escucha keepalive
         ▼                           │
┌──────────────────────────────────────────────────────────────────────────────┐
│                      RABBITMQ (AMQP 0-9-1)                                   │
│                                                                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌───────────────┐  ┌───────────┐  │
│  │  mining_tasks  │  │  mining_results  │  │   keepalive   │  │scale_req  │  │
│  │  (durable,     │  │  (DLX→dlx_mining │  │ (TTL 30s, no  │  │(durable)  │  │
│  │   prefetch=1)  │  │   → mining_res..)│  │   durable)    │  │           │  │
│  └───────┬────────┘  └────────┬─────────┘  └───────┬───────┘  └───────────┘  │
│          │                   │                     │                         │
│          ▼                   ▼                     ▼                         │
│  Consumidores:      Consumidor:            Consumidor:                       │
│  Workers            Coordinator (líder)    Pool                              │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐    │
│  │  block_confirmed (fanout exchange, no durable)                       │    │
│  └────┬──────────────────────────────────────────────────────┬──────────┘    │
│       │                                                      │               │
│       ▼                                                      ▼               │
│  Pool (sub exclusivo)                              Coordinators (sub exclus.) │
└──────────────────────────────────────────────────────────────────────────────┘
         │                    ▲                    ▲
         │ consume            │ publica            │ publica
         │ mining_tasks       │ mining_results     │ block_confirmed
         ▼                    │                    │
┌──────────────────────────────────────────────────────────────────────────────┐
│  WORKERS (CPU / GPU)                                                         │
│                                                                              │
│  ┌─────────────────────────────────────────────┐                            │
│  │  worker/consumer.js                          │                            │
│  │  ● prefetch(1) → 1 tarea a la vez            │                            │
│  │  ● startConsuming(RABBITMQ_URL)              │                            │
│  │  ● publica resultado en mining_results        │                            │
│  └───────────────────┬──────────────────────────┘                            │
│                      │                                                       │
│                      ▼                                                       │
│  ┌─────────────────────────────────────────────┐                            │
│  │  worker/miner.js                             │                            │
│  │                                              │                            │
│  │  CPU (WORKER_TYPE='CPU'):                    │                            │
│  │    node pow_cpu_range.js                     │                            │
│  │      <payload> <difficulty> <start> <end>    │                            │
│  │                                              │                            │
│  │  GPU (WORKER_TYPE='GPU'):                    │                            │
│  │    ./pow_gpu_range                           │                            │
│  │      <payload> <difficulty> <start> <end>    │                            │
│  │    (sm_61, GTX 1050, CUDA 12.2)              │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
│  Keepalive: cada 10s → PUBLICAR en cola 'keepalive'                          │
│  HTTP: /worker/status (puerto 3002)                                          │
└──────────────────────────────────────────────────────────────────────────────┘
         ▲                                        ▲
         │ Verifica custodia                      │ POST /mine
         │                                        │ (cuando pool gatilla)
         │                                        │
┌──────────────────────────────────────────────────────────────────────────────┐
│  COORDINATOR (Express :3000) — Con tolerancia a fallos Bully                 │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐            │
│  │  LÍDER                                                       │            │
│  │  ┌──────────────┐  ┌───────────┐  ┌──────────────────────┐  │            │
│  │  │ consumeResults│  │handleRes.│  │  storeBlock()        │  │            │
│  │  │ (mining_results) │  │NCT.2-4│  │  HSET block:<hash>   │  │            │
│  │  │              │  │          │  │  RPUSH chain          │  │            │
│  │  └──────────────┘  └──────────┘  └──────────────────────┘  │            │
│  │                                                              │            │
│  │  ┌────────────────┐  ┌───────────────────────────────────┐  │            │
│  │  │ publishBlockConf.│  │ consumeDLQ (mining_results_dlq)   │  │            │
│  │  └────────────────┘  └───────────────────────────────────┘  │            │
│  └──────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐            │
│  │  FOLLOWER                                                    │            │
│  │  ● Poll leader:coordinator cada 5s                           │            │
│  │  ● NO consume mining_results                                 │            │
│  │  ● Recibe block_confirmed (fanout) por consistencia           │            │
│  └──────────────────────────────────────────────────────────────┘            │
│                                                                              │
│  ┌──────────────────────────────────────────────┐                           │
│  │  LeaderElection (Bully)                       │                           │
│  │  ● ID = COORDINATOR_ID o hash(hostname)      │                           │
│  │  ● Redis Pub/Sub: election:start/answer/victory│                           │
│  │  ● SET leader:coordinator <id> EX 15          │                           │
│  │  ● Heartbeat cada 5s                          │                           │
│  │  ● Poll follower cada 5s                      │                           │
│  └──────────────────────────────────────────────┘                           │
│                                                                              │
│  ┌─────────────────────────────────────────────┐                            │
│  │  db.js (SQLite)                              │                            │
│  │  entities(id, name, display_name,            │                            │
│  │           password_hash, public_key,         │                            │
│  │           private_key)                       │                            │
│  └─────────────────────────────────────────────┘                            │
│                                                                              │
│  Endpoints: /status, /chain, /chain/:hash, /chain/lot/:lotId, /entities     │
│            /sign (JWT), /auth/login, /auth/me, /mine                         │
└──────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  REDIS                                                                       │
│                                                                              │
│  block:<hash> ───► Hash (previous_hash, nonce, timestamp, transactions,     │
│  │                    block_hash)                                            │
│  │                                                                           │
│  chain ───► List de hashes ordenados                                        │
│  │                                                                           │
│  leader:coordinator ───► String (EX 15s) — líder actual                      │
│  │                                                                           │
│  lock:<prevHash> ───► String (NX EX 30s) — lock atómico de commit           │
│                                                                              │
│  Persistencia: AOF (redis-server --appendonly yes)                           │
└──────────────────────────────────────────────────────────────────────────────┘

────────────────────────────────────────────────────────────────────────────────
                    GPU EXTERNO (k3s cluster, namespace: g-amarillo)

  GKE ───RabbitMQ LB ──► GPU Worker Pod ──► mining_results (vía WAN)
        35.202.170.91                │
                                     ▼
                               pow_gpu_range.cu
                               (CUDA, sm_61, GTX 1050)
────────────────────────────────────────────────────────────────────────────────
                    DNS / TLS

  custody-chain.darwin-consulting.online
  ├── Hostinger → A record → Ingress Controller LB IP
  ├── cert-manager → Let's Encrypt (renovación automática)
  └── Nginx Ingress → Frontend (puerto 80)
────────────────────────────────────────────────────────────────────────────────
                    AUTENTICACIÓN

  Usuario → POST /auth/login → JWT (24h)
         → POST /sign [JWT Bearer] → transacción firmada
         → POST /transaction (Pool) → validateTransaction(tx)
         → firma Ed25519 vs publicKey(origen)  (o __unsigned__ para testing)
────────────────────────────────────────────────────────────────────────────────
                    BLOQUE GÉNESIS

  {
    previous_hash: "00000000000000000000000000000000",
    nonce: "0",
    timestamp: "<startup_time>",
    transactions: [],
    block_hash: md5("genesis")  // = "000048980b98addc5dbd60dc56ccceb6"
  }
────────────────────────────────────────────────────────────────────────────────
```

---

## Apéndice: Resumen de Patrones de Diseño Distribuido

| Problema | Solución en Pilar 2 |
|---|---|
| Comunicación asíncrona | RabbitMQ AMQP con colas durables y ACK explícito |
| Distribución de carga | Work Queue con prefetch(1) en mining_tasks |
| Elección de líder | Algoritmo Bully sobre Redis Pub/Sub |
| Exclusión mutua distribuida | SET NX EX (Redis lock) por bloque |
| Notificación 1:N | Fanout exchange block_confirmed |
| Liveness detection | Keepalive queue con TTL + registry eviction |
| Dead letters / fallos | DLX + DLQ para resultados fallidos |
| Reintentos con backoff | Retry exponencial para handlers críticos |
| Servicio vs microservicio | Entrypoint único (monolito modular) por SERVICE env |
| Auto-escalado | HPA por CPU en Kubernetes |
| GPU remota | Worker conectado vía WAN a RabbitMQ central |
| Autenticación | JWT con bcrypt + Ed25519 (firma de transacciones) |
| Persistencia de estado | Redis (blockchain) + SQLite (auth) |
| PoW no interactivo | MD5(payload + nonce).startsWith(difficulty) |
