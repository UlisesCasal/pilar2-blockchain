# Pilar 2 — Infraestructura de servicios distribuidos para una blockchain escalable

> **Materia:** Sistemas Distribuidos y Programación Paralela — UNLu DCB  
> **Docente:** Dr. David Petrocelli  
> **Repositorio:** [Pilar 2 — Blockchain de Custodia de Minerales](https://github.com/ulisescasal/Pilar2)

---

## Índice

- [Visión General](#visión-general)
- [P1 — Validación de Transacciones y Bloques (PoW + Signature)](#p1--validación-de-transacciones-y-bloques)
- [P2 — Distribución async de tareas de minería (RabbitMQ)](#p2--distribución-async-de-tareas-de-minería-rabbitmq)
- [P3 — Estado blockchain, transacciones y bloques (Redis)](#p3--estado-blockchain-transacciones-y-bloques-redis)
- [P4 — Nodo coordinador de tareas (NCT)](#p4--nodo-coordinador-de-tareas-nct)
- [P5 — Pool de Transacciones](#p5--pool-de-transacciones)
- [Diagrama general de la arquitectura](#diagrama-general-de-la-arquitectura)
- [Despliegue e Infraestructura](#despliegue-e-infraestructura)
- [Variables de Entorno](#variables-de-entorno)

---

## Visión General

**Pilar 2** es una blockchain privada para la trazabilidad de minerales a lo largo de la cadena de suministro minera argentina. Cada transacción representa la transferencia de custodia de un lote de mineral entre entidades reales del dominio.

```mermaid
flowchart TB
    subgraph Dominio["🏭 Dominio Minero"]
        ENT1["Mina San Juan"] -->|"extrae CRUDO"| ENT2["Planta Neuquén"]
        ENT2 -->|"procesa a MINERAL"| ENT3["Refinería Bahía Blanca"]
        ENT3 -->|"refina"| ENT4["Terminal Puerto Rosario"]
        ENT4 -->|"distribuye"| ENT1
        ENT5["Operador Pozo Mendoza"]
        ENT6["⚠️ Impostor (test)"]
    end
```

### Stack tecnológico

| Capa | Tecnología |
|---|---|
| **Runtime** | Node.js 20 (Alpine Linux) |
| **API** | Express.js |
| **Mensajería asíncrona** | RabbitMQ 3.x (AMQP 0-9-1) |
| **Base de datos en memoria** | Redis 7 (AOF persistente) |
| **Base de datos SQL** | SQLite (better-sqlite3) |
| **Autenticación** | JWT + bcrypt |
| **Minero CPU** | Node.js — `pow_cpu_range.js` |
| **Minero GPU** | CUDA C++ — `pow_gpu_range.cu` (sm_61) |
| **Hashing** | MD5 |
| **Contenedores** | Docker + Docker Compose |
| **Orquestación** | Kubernetes (GKE) + Helm |
| **Infraestructura** | OpenTofu (Terraform) |
| **CI/CD** | GitHub Actions |
| **GPU externa** | k3s cluster (namespace `g-amarillo`) |
| **Frontend** | React 18 + Vite 5 + Nginx |

---

## P1 — Validación de Transacciones y Bloques

> **Correspondencia TP:** *"Minero en CUDA (realizado en Pilar 1) para resolver tareas de PoW... Este algoritmo debe recibir parámetros para incrementar la complejidad de las tareas (manejado por el nodo coordinador)."*

### Componentes

- `validator/index.js` — lógica de validación (reutilizada como librería)
- `validator/server.js` — microservicio HTTP (no utilizado en pipeline activo)
- `worker/miner.js` — ejecutor del binario PoW (CPU o GPU)
- `shared/crypto.js` — firma y verificación Ed25519
- `shared/schema.js` — esquema de transacción

### 1.1 Validación de Transacciones

Toda transacción debe cumplir las siguientes reglas, ejecutadas por `validateTransaction()`:

```mermaid
flowchart LR
    TX["Transacción\nentrante"] --> CHECK["checkTransaction()"]
    CHECK --> F1["¿8 campos requeridos?\nid, id_lote, origen, destino,\ncantidad, tipo, timestamp, firma"]
    CHECK --> F2["¿cantidad > 0?"]
    CHECK --> F3["¿tipo ∈ [MINERAL, CRUDO]?"]
    CHECK --> F4["¿origen ≠ destino?"]
    CHECK --> F5["¿firma Ed25519 válida?\no __unsigned__ (testing)"]
    F1 -->|"✅"| PASS["Pasa validación"]
    F2 -->|"✅"| PASS
    F3 -->|"✅"| PASS
    F4 -->|"✅"| PASS
    F5 -->|"✅"| PASS
    F1 -->|"❌"| REJECT["400 Bad Request"]
    F2 -->|"❌"| REJECT
    F3 -->|"❌"| REJECT
    F4 -->|"❌"| REJECT
    F5 -->|"❌"| REJECT
```

**Campos requeridos:**

```json
{
  "id": "tx-001",
  "id_lote": "LOTE-STRESS-k3x8f-1",
  "origen": "mina-san-juan",
  "destino": "planta-neuquen",
  "cantidad": 100,
  "tipo": "CRUDO",
  "timestamp": "2026-06-26T12:00:00.000Z",
  "firma": "MEUCIQDVW0z..."
}
```

### 1.2 Firma Digital Ed25519

La firma se calcula sobre una representación canónica que excluye el campo `firma`:

```javascript
// Campos que se firman (EN ESTE ORDEN):
const canonical = JSON.stringify({
  id, id_lote, origen, destino, cantidad, tipo, timestamp
  // firma NO se incluye
});

// Firma: crypto.sign(null, data, privateKey)
// Verificación: crypto.verify(null, data, publicKey, signature)
```

**Entidades y sus claves:**

| Entidad | Clave privada | Clave pública |
|---|---|---|
| `mina-san-juan` | `keys/mina-san-juan.pem` | `keys/mina-san-juan.pub.pem` |
| `planta-neuquen` | `keys/planta-neuquen.pem` | `keys/planta-neuquen.pub.pem` |
| `refineria-bahia-blanca` | `keys/refineria-bahia-blanca.pem` | `keys/refineria-bahia-blanca.pub.pem` |
| `terminal-puerto-rosario` | `keys/terminal-puerto-rosario.pem` | `keys/terminal-puerto-rosario.pub.pem` |
| `operador-pozo-mendoza` | `keys/operador-pozo-mendoza.pem` | `keys/operador-pozo-mendoza.pub.pem` |
| `impostor` | `keys/impostor.pem` | `keys/impostor.pub.pem` |

**Sentinel de testing:** Cuando `firma: "__unsigned__"`, se salta la verificación criptográfica. Esto permite ejecutar pruebas de estrés sin necesidad de firmar cada transacción.

### 1.3 Proof of Work (PoW)

El mecanismo de consenso utiliza MD5 con un nonce. El payload canónico se construye según la cantidad de transacciones:

| Caso | Formato | Ejemplo |
|---|---|---|
| 1 transacción | `<id_lote>:<origen>-><destino>:<cantidad>tn:<prevHash>` | `LOTE-001:mina-san-juan->planta-neuquen:100tn:0000...` |
| Múltiples txs | `<ids-ordenados-csv>:<prevHash>` | `tx-001,tx-002,tx-003:0000...` |

**Algoritmo:**

```
hash = md5(payload + nonce)
resultado VÁLIDO si: hash.startsWith(DIFFICULTY)

Ejemplo con difficulty = "0000":
  payload + "12345" → md5 → "0000a1b2c3d4e5f6..." ✅ VÁLIDO
  payload + "99999" → md5 → "a1b2c3d4e5f60000..." ❌ INVÁLIDO
```

### 1.4 Minero CPU vs GPU

```mermaid
flowchart LR
    TASK["mining_tasks"] --> WORKER
    subgraph WORKER["Worker"]
        C["consumer.js"] --> M["miner.js"]
        M -->|"WORKER_TYPE=CPU"| CPU["node pow_cpu_range.js\n<payload> <diff> <start> <end>\nBúsqueda secuencial"]
        M -->|"WORKER_TYPE=GPU"| GPU["./pow_gpu_range\n<payload> <diff> <start> <end>\nMiles de hilos CUDA\nsm_61 · GTX 1050"]
    end
    CPU -->|"stdout: Nonce / NOT FOUND"| RESULT["mining_results"]
    GPU -->|"stdout: Nonce / NOT FOUND"| RESULT
```

**Diferencias clave:**

| Aspecto | CPU | GPU |
|---|---|---|
| **Binary** | `tpi/pilar1/Hit7/CPU/pow_cpu_range.js` | `tpi/pilar1/Hit7/GPU/pow_gpu_range.cu` |
| **Ejecución** | `node pow_cpu_range.js ...` | `./pow_gpu_range ...` |
| **Paradigma** | Secuencial — un nonce a la vez | Masivamente paralelo — miles de hilos |
| **Rendimiento** | ~70ms/búsqueda + ~200ms spawn | Órdenes de magnitud más rápido |
| **Compilación** | No requiere (JS interpretado) | `nvcc -O3 -arch=sm_61` (CUDA 12.2) |
| **Hardware** | Cualquier CPU | NVIDIA GTX 1050 (Pascal) |

**Output de ambos mineros (mismo formato):**

```
Prefix: 0000
Nonce:   12345
Prev_Hash: abc123...
Hash:     0000def456...
Time:   123.4567 ms
```

Si no encuentra solución en el rango:

```
NOT FOUND
Time:   456.7890 ms
```

---

## P2 — Distribución async de tareas de minería (RabbitMQ)

> **Correspondencia TP:** *"Integración de un sistema de colas (RabbitMQ) configurado en una arquitectura híbrida de colas y tópicos a la cual se suscriben un conjunto de nodos workers..."*

### 2.1 Conexión

- **Protocolo:** AMQP 0-9-1
- **URL por defecto:** `amqp://guest:guest@rabbitmq:5672`
- **TLS (prod):** `amqps://...` vía `RABBITMQ_CA`, `RABBITMQ_CERT`, `RABBITMQ_KEY`
- **Reconexión:** Backoff exponencial: 1s → 2s → 4s → 8s → 16s → 32s (6 intentos)

### 2.2 Colas y Exchanges

```mermaid
flowchart TB
    subgraph RabbitMQ["🐰 RabbitMQ — Colas y Exchanges"]
        direction TB
        
        subgraph Queues["Colas"]
            MT["mining_tasks\n📦 durable · prefetch=1"]
            MR["mining_results\n📦 durable · DLX → dlx_mining"]
            DLQ["mining_results_dlq\n📦 durable"]
            KL["keepalive\n⏳ TTL=30s · no durable"]
            SR["scale_requests\n📦 durable"]
        end
        
        subgraph Exchanges["Exchanges"]
            BC["block_confirmed\n📡 fanout · no durable"]
            DLX["dlx_mining\n🔀 direct · durable"]
        end
        
        MR -.->|"nack sin requeue"| DLX
        DLX --> DLQ
    end
    
    POOL["Pool"] -->|"publica tareas"| MT
    COORD_L["Coordinator\n(líder)"] -->|"publica tareas"| MT
    MT -->|"consume"| W1["Worker 1"]
    MT -->|"consume"| W2["Worker 2"]
    MT -->|"consume"| WN["Worker N"]
    
    W1 -->|"publica resultado"| MR
    W2 -->|"publica resultado"| MR
    WN -->|"publica resultado"| MR
    MR -->|"consume (solo líder)"| COORD_L
    
    COORD_L -->|"publica bloque"| BC
    BC -->|"suscribe"| POOL
    BC -->|"suscribe"| COORD_F1["Coordinator\n(follower)"]
    BC -->|"suscribe"| COORD_F2["Coordinator\n(follower)"]
    
    W1 -->|"heartbeat c/10s"| KL
    W2 -->|"heartbeat c/10s"| KL
    WN -->|"heartbeat c/10s"| KL
    KL -->|"consume"| POOL
    
    POOL -->|"si 0 workers"| SR
```

### 2.3 Tabla de colas

| Cola | Durable | TTL | DLX | Prefetch | Producen | Consumen |
|---|---|---|---|---|---|---|
| `mining_tasks` | ✅ Sí | — | — | 1 por worker | Pool, Coordinator | Workers |
| `mining_results` | ✅ Sí | — | `dlx_mining` | 1 | Workers | Coordinator (solo líder) |
| `mining_results_dlq` | ✅ Sí | — | — | — | DLX reenvía | Coordinator (logging) |
| `keepalive` | ❌ No | 30s | — | — | Workers | Pool |
| `scale_requests` | ✅ Sí | — | — | — | Pool | — (futuro KEDA) |

### 2.4 Patrones de mensajería implementados

**1. Work Queue / Competing Consumers — `mining_tasks`**

```
Pool ──PUBLISH──► mining_tasks ──► Worker 1 (prefetch=1)
                   (durable)    ──► Worker 2 (prefetch=1)
                                ──► Worker N (prefetch=1)
```

- Mensajes persistentes (sobreviven reinicios de RabbitMQ)
- Cada worker toma una tarea a la vez (`prefetch=1`)
- ACK explícito tras publicar resultado

**2. Dead Letter Exchange — `mining_results`**

```
Worker → mining_results (DLX: dlx_mining)
           │
     si handler falla
           ▼
    mining_results_dlq → Coordinator (logging)
```

- Si el handler del líder lanza excepción, RabbitMQ reenvía automáticamente el mensaje al DLX
- El DLX lo redirige a la cola muerta para inspección

**3. Fanout / Pub-Sub — `block_confirmed`**

```
Coordinator LÍDER ──PUBLISH──► block_confirmed (fanout)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
                Pool           Coord Follower   Coord Follower
              (flag=false)     (notificación)   (notificación)
```

- Cada suscriptor crea su cola exclusiva auto-delete
- Pool lo usa para liberar el flag de minería y gatillar el siguiente bloque

**4. Keepalive TTL — `keepalive`**

```
Worker ──PUBLISH cada 10s──► keepalive ──CONSUME──► Pool
                              TTL=30s
                              no durable
```

- Cola no durable: perder keepalives al reiniciar RabbitMQ es aceptable
- Pool evicta workers cuyo `lastSeen + TTL < now`

---

## P3 — Estado blockchain, transacciones y bloques (Redis)

> **Correspondencia TP:** *"Integración de un motor de DB con persistencia (Redis + Persistencia) el cual permite registrar el trackeo de las operaciones en la base de datos. Esta será la encargada de construir la 'blockchain'."*

### 3.1 Schema de Redis

```mermaid
flowchart LR
    subgraph Redis["🗄️ Redis — Blockchain"]
        direction TB
        
        CHAIN["chain\n📋 LIST"]
        CHAIN --> H1["block:<hash_1>\n🔢 HASH"]
        CHAIN --> H2["block:<hash_2>\n🔢 HASH"]
        CHAIN --> H3["block:<...>\n🔢 HASH"]
        
        LOCK["lock:<prevHash>\n🔒 SET NX EX 30"]
        LEADER["leader:coordinator\n👑 STRING EX 15"]
    end
```

### 3.2 Keys

| Key | Tipo | Comando | TTL | Propósito |
|---|---|---|---|---|
| `block:<block_hash>` | Hash | `HSET` / `HGETALL` | — | Datos completos del bloque |
| `chain` | List | `RPUSH` / `LRANGE` | — | Hashes ordenados de todos los bloques |
| `leader:coordinator` | String | `SET EX` / `GET` | 15s | ID del coordinator líder actual |
| `lock:<prevHash>` | String | `SET NX EX` | 30s | Lock atómico para commit de bloque |

### 3.3 Estructura de un bloque en Redis

```
HSET block:000048980b98addc5dbd60dc56ccceb6 \
    previous_hash  "00000000000000000000000000000000" \
    nonce          "0" \
    timestamp      "2026-06-26T00:00:00.000Z" \
    transactions   "[]" \
    block_hash     "000048980b98addc5dbd60dc56ccceb6"

RPUSH chain 000048980b98addc5dbd60dc56ccceb6
```

### 3.4 Bloque génesis

Se crea automáticamente cuando la chain está vacía al iniciar el primer Coordinator:

```json
{
  "previous_hash": "00000000000000000000000000000000",
  "nonce": "0",
  "timestamp": "<fecha de inicio>",
  "transactions": [],
  "block_hash": "000048980b98addc5dbd60dc56ccceb6"
}
```

El `block_hash` del génesis es `md5("genesis")` — es determinista, siempre el mismo valor.

### 3.5 Persistencia

Redis se ejecuta con AOF (Append Only File):

```bash
redis-server --appendonly yes
```

Esto garantiza que la blockchain persiste entre reinicios del contenedor.

### 3.6 SQLite — Base de datos de autenticación

Además de Redis, el Coordinator utiliza SQLite para almacenar entidades y credenciales:

```
📁 data/auth.db

Tabla: entities
├── id            INTEGER PRIMARY KEY
├── name          TEXT UNIQUE     -- "mina-san-juan"
├── display_name  TEXT            -- "Mina San Juan"
├── password_hash TEXT            -- bcrypt("admin123")
├── public_key    TEXT            -- PEM Ed25519
└── private_key   TEXT            -- PEM Ed25519
```

**Datos semilla** (6 entidades cargadas al primer inicio):
- mina-san-juan, planta-neuquen, refineria-bahia-blanca
- operador-pozo-mendoza, terminal-puerto-rosario, impostor

Todas comparten la misma password por defecto: `admin123`

### 3.7 Consultas disponibles a la chain

| Endpoint | Propósito |
|---|---|
| `GET /chain` | Blockchain completa |
| `GET /chain/:blockHash` | Bloque individual |
| `GET /chain/lot/:lotId` | Transacciones de un lote a lo largo de toda la chain |
| `GET /entities` | Listar entidades registradas |

---

## P4 — Nodo coordinador de tareas (NCT)

> **Correspondencia TP:** *"Nodo coordinador que será responsable de definir cómo se estructuran las transacciones, formar los bloques, y responsable del algoritmo de consenso."*

El NCT es el cerebro del sistema. Existen **2 réplicas** de Coordinator, pero solo la **líder** (electa mediante algoritmo Bully) consume resultados de minería.

### 4.1 Proceso completo (NCT.1 → NCT.4)

```mermaid
sequenceDiagram
    participant P as Pool
    participant C as Coordinator (Líder)
    participant R as Redis
    participant Q as RabbitMQ
    participant W as Workers
    
    Note over P,W: NCT.1 — Publicación de Tareas
    P->>C: POST /mine { transactions, prevHash }
    C->>R: GET chain → last block → prevHash
    C->>C: buildPayload(txs, prevHash)
    C->>C: split(workerCount) → N rangos de nonce
    C->>Q: PUBLISH mining_tasks × N
    
    Note over P,W: NCT.2 — Competencia/Cooperación
    Q->>W: CONSUME mining_tasks (prefetch=1)
    W->>W: mine(payload, difficulty, start, end)
    W->>Q: PUBLISH mining_results { found, nonce, hash }
    
    Note over P,W: NCT.3 — Verificación de resultados
    Q->>C: CONSUME mining_results (solo líder)
    C->>C: ¿found === true?
    C->>R: acquireLock(prevHash) → SET NX EX 30
    C->>C: md5(payload + nonce).startsWith(difficulty)?
    
    Note over P,W: NCT.4 — Almacenamiento de Bloques
    C->>R: HSET block:<hash> ...
    C->>R: RPUSH chain <hash>
    C->>Q: PUBLISH block_confirmed (fanout)
    Q->>P: notifica → _miningInProgress = false
    Q->>C: notifica (follower) → consistencia
```

### 4.2 NCT.1 — Publicación de Tareas

El Pool gatilla la minería cuando acumula suficientes transacciones (`pool.size() >= BLOCK_THRESHOLD`). Esto puede ocurrir de dos formas:

**A) Vía HTTP — Pool llama a Coordinator:**
```
Pool ──POST /mine──► Coordinator
```

**B) Vía directa — Pool publica en RabbitMQ (fallback):**
```
Pool ──sendToQueue('mining_tasks')──► RabbitMQ
```

Cada tarea publicada contiene:

```json
{
  "task_id": "uuid-unico",
  "payload": "LOTE-001:mina->planta:100tn:0000...",
  "prev_hash": "00004898...",
  "difficulty": "0000",
  "nonce_start": 0,
  "nonce_end": 4503599627370495,
  "transactions": [...]
}
```

**División del espacio de nonces:**

```
MAX_NONCE = Number.MAX_SAFE_INTEGER = 9007199254740991

Con 2 workers:
  Worker 1: [0, 4503599627370495]
  Worker 2: [4503599627370496, 9007199254740991]

Con N workers:
  chunk = MAX_NONCE / N
  Worker i: [i × chunk, (i+1) × chunk - 1]
  Último worker: [i × chunk, MAX_NONCE]
```

### 4.3 NCT.2 — Competencia / Cooperación

Los workers consumen tareas de `mining_tasks` con `prefetch=1`. Cada worker:

1. Toma la tarea de la cola
2. Ejecuta el minero (CPU o GPU) sobre su rango asignado
3. Publica el resultado en `mining_results`
4. Hace ACK del mensaje original

```javascript
// worker/consumer.js — flujo por tarea
const task = JSON.parse(msg.content.toString());
const mineResult = await mine({ payload, difficulty, nonceStart, nonceEnd });
const result = {
  task_id: task.task_id,
  worker_id: WORKER_ID,
  found: mineResult.found,
  nonce: mineResult.nonce,
  hash: mineResult.hash,
  payload: task.payload,
  prev_hash: task.prev_hash,
  difficulty: task.difficulty,
  transactions: task.transactions,
};
channel.sendToQueue('mining_results', Buffer.from(JSON.stringify(result)), { persistent: true });
channel.ack(msg);
```

### 4.4 NCT.3 — Verificación de Resultados

**Solo el líder** consume de `mining_results`. El proceso de verificación tiene 3 gates:

```
1. Gate: ¿found === true?
   ├── false → descartar (worker no encontró nonce en su rango)
   └── true → continuar

2. Gate: acquireLock(prevHash)
   ├── false → otro worker ya confirmó este bloque, descartar
   └── true → lock adquirido, continuar (SET NX EX 30)

3. Gate: md5(payload + nonce).startsWith(difficulty)
   ├── false → nonce inválido, descartar
   └── true → ¡PoW válido! Proceder a almacenar bloque
```

El **lock atómico** (`SET NX EX 30`) garantiza que aunque dos workers encuentren solución casi simultáneamente, solo una se confirma. El TTL de 30s evita bloqueos permanentes si el líder falla.

### 4.5 NCT.4 — Almacenamiento de Bloques

```javascript
// 1. Construir objeto bloque
const block = buildBlock(
  { prev_hash: result.prev_hash, transactions: result.transactions },
  result.nonce,
  hash  // hash verificado
);

// 2. Almacenar en Redis
await storeBlock(block);
// → HSET block:<hash> previous_hash nonce timestamp transactions block_hash
// → RPUSH chain <hash>

// 3. Notificar a toda la red
await publishBlockConfirmed(block);
// → PUBLISH a exchange 'block_confirmed' (fanout)
```

### 4.6 Tolerancia a Fallos — Algoritmo Bully

Para garantizar que siempre haya exactamente un líder consumiendo resultados, se implementa el algoritmo Bully sobre Redis Pub/Sub:

```mermaid
flowchart TB
    subgraph Normal["Operación Normal"]
        L1["Líder: Coordinator A"] -->|"heartbeat c/5s"| RK["Redis\nleader:coordinator\nEX 15"]
        F1["Follower: Coordinator B"] -->|"poll c/5s"| RK
        F2["Follower: Coordinator C"] -->|"poll c/5s"| RK
        L1 -->|"consume mining_results"| RQ["RabbitMQ"]
    end
    
    subgraph Failover["Caída del Líder"]
        RK2["leader:coordinator\nexpira (15s)"]
        F1_2["Coordinator B"] -->|"detecta clave expirada"| E1["election:start\nPUB/SUB"]
        F2_2["Coordinator C"] -->|"detecta clave expirada"| E1
        E1 -->|"responde ID mayor"| WIN["Gana el de mayor ID"]
        WIN -->|"SET leader:coordinator"| L2["Nuevo líder: Coordinator B"]
        L2 -->|"consume mining_results"| RQ2["RabbitMQ"]
    end
```

**Parámetros:**

| Parámetro | Valor | Descripción |
|---|---|---|
| `LEADER_TTL` | 15s | TTL de la clave `leader:coordinator` |
| `HEARTBEAT_INTERVAL` | 5s | Intervalo con que el líder renueva la clave |
| `ELECTION_TIMEOUT` | 3s | Espera por respuestas en una elección |
| `LEADER_CHECK_INTERVAL` | 5s | Frecuencia con que los followers verifican |

**Propiedades:**

- **Split-brain prevention:** El lock atómico `SET NX EX` evita que dos líderes temporales confirmen el mismo bloque
- **Failover:** < 15s desde que el líder cae hasta que otro es electo
- **ID:** Se puede asignar vía `COORDINATOR_ID` o se deriva del hostname

---

## P5 — Pool de Transacciones

> **Correspondencia TP:** *"Pool de transacciones (TrP) pendientes donde el TrP fragmenta una tarea completa en desafíos más pequeños... subdivide tareas de minería en partes más pequeñas (rangos de búsqueda del nonce)... recibir keep-alive de los mineros GPU..."*

### 5.1 Arquitectura del Pool

```mermaid
flowchart TB
    subgraph Pool["🏊 Pool de Transacciones"]
        direction TB
        
        IN["POST /transaction"] --> V["validateTransaction()\n(schema + Ed25519)"]
        V -->|"válida"| CC["checkCustody()\n¿el origen es el dueño\ndel lote?"]
        CC -->|"sí"| ADD["pool.add(tx)\n(buffer en memoria)"]
        CC -->|"no"| REJ["403 Forbidden\n'no tiene custodia'"]
        ADD --> THRESHOLD{"pool.size() >=\nBLOCK_THRESHOLD?"}
        THRESHOLD -->|"sí"| FLUSH["pool.flush() → batch\ntriggerMining(batch)"]
        THRESHOLD -->|"no"| WAIT["Esperar más txs"]
        
        FLUSH --> SPLIT["nonce-splitter.js\nsplit(workerCount)"]
        SPLIT --> PUB["publicar en mining_tasks"]
        
        POOL_STATE["Estado interno:
        · pool: [] (array en memoria)
        · _miningInProgress: boolean
        · registry: Map<worker_id, {type, lastSeen}>"]
    end
    
    subgraph Workers["Workers"]
        REG["worker-registry.js\n· TTL = 30s
        · register(id, type)
        · evict si lastSeen + TTL < now
        · count({ type: 'GPU' })"]
    end
    
    KEEP["keepalive queue\n(c/10s)"] --> REG
    
    FLUSH -->|"si 0 workers activos"| SCALE["scale_requests queue\n→ futuro KEDA"]
```

### 5.2 Flujo del Pool

**Paso a paso desde que llega una transacción:**

```
1. POST /transaction → validateTransaction(tx)
   ├── 8 campos requeridos
   ├── cantidad > 0
   ├── tipo ∈ [MINERAL, CRUDO]
   ├── origen ≠ destino
   └── firma Ed25519 ok (o __unsigned__)

2. checkCustody(tx)
   ├── pool.findByLot(lotId) → ¿último.destino === tx.origen?
   └── GET /chain/lot/:lotId → ¿último.destino === tx.origen?

3. pool.add(tx)

4. ¿pool.size() >= BLOCK_THRESHOLD Y _miningInProgress === false?
   ├── Sí → pool.flush() → triggerMining(batch)
   │        ├── GET /status (Coordinator) → prevHash
   │        ├── split(workerCount) → rangos
   │        ├── buildPayload(batch, prevHash)
   │        └── PUBLISH mining_tasks × N
   └── No → esperar
```

**Cadena de custodia:**

La custodia se verifica contra dos fuentes:

```
Para tx con lotId = "LOTE-001":
  
  REGLA: último.destino del lote debe coincidir con tx.origen

  1. Buscar en pending pool:
     ├── pool.findByLot("LOTE-001")
     └── ¿hay pendientes? → último.destino === tx.origen?
  
  2. Buscar en chain confirmada:
     ├── GET /chain/lot/LOTE-001 (Coordinator)
     └── ¿hay registros? → último.destino === tx.origen?
  
  3. Si no hay registros → es la primera tx del lote → ok
```

### 5.3 Worker Registry (Keepalive)

```mermaid
flowchart LR
    subgraph WorkerLifecycle["Ciclo de vida de un Worker"]
        START["Worker arranca"] -->|"PUBLISH keepalive"| KEEP["cola keepalive\nTTL=30s"]
        KEEP -->|"CONSUME"| POOL_REG["Pool: registry.register(id, type)"]
        POOL_REG -->|"count()"| EVICT["¿lastSeen + TTL < now?\n→ evict"]
        EVICT -->|"sigue vivo"| WORK["Worker mina txs"]
        WORK -->|"cada 10s"| KEEP
        EVICT -->|"expirado"| DEAD["Worker eliminado del registry"]
    end
```

```javascript
// worker-registry.js — TTL-based, evicción lazy
const registry = new Map();

function register(id, type) {
  registry.set(id, { id, type, lastSeen: Date.now() });
}

function count(filter) {
  _evict(); // elimina workers con lastSeen + TTL < now
  if (!filter.type) return registry.size;
  return [...registry.values()].filter(w => w.type === filter.type).length;
}
```

**Evento de reconexión:** Cuando un worker aparece después de que el registry estaba vacío, y hay txs pendientes en el pool, se gatilla minería automáticamente:

```javascript
// pool/index.js — al recibir keepalive
if (wasEmpty && pool.size() > 0) {
  const batch = pool.flush();
  triggerMining(batch);
}
```

### 5.4 Auto-escalado

Cuando `registry.count() === 0` (ningún worker activo), el Pool publica un mensaje en la cola `scale_requests`:

```json
{
  "type": "scale_up",
  "service": "worker",
  "reason": "no_active_workers",
  "requested_count": 2
}
```

Esta cola está preparada para integrarse con **KEDA** (Kubernetes Event-Driven Autoscaling) en el futuro. Actualmente, el HPA de Kubernetes escala workers basado en CPU:

```yaml
# charts/blockchain/templates/worker/hpa.yaml
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

---

## Diagrama general de la arquitectura

```mermaid
flowchart TB
    subgraph Clients["📱 Clientes"]
        FE["Frontend\nReact + Vite\n:8080"]
        ST["Stress Test\nscripts/stress-test.js"]
        CU["curl / scripts"]
    end
    
    subgraph Services["⚙️ Servicios (Docker / K8s)"]
        direction TB
        
        POOL["🏊 Pool (Express :3001)\n· validateTransaction()\n· checkCustody()\n· transaction-pool.js\n· nonce-splitter.js\n· worker-registry.js"]
        
        COORD["👑 Coordinator (Express :3000)\n· Líder: consume mining_results\n· Follower: poll leader\n· Bully Election\n· SQLite auth"]
        
        VAL["✅ Validator (Express :3003)\n· validateTransaction()\n· Servicio standalone"]
        
        WORK["⛏️ Workers (Express :3002)\n· consumer.js → mining_tasks\n· miner.js → CPU/GPU PoW\n· keepalive cada 10s"]
        
        NGINX["Frontend Nginx\nproxy_pass /api/coordinator/\nproxy_pass /api/pool/"]
    end
    
    subgraph Infra["🗄️ Infraestructura"]
        RABBIT["🐰 RabbitMQ 3\n· mining_tasks\n· mining_results + DLQ\n· keepalive (TTL 30s)\n· block_confirmed (fanout)\n· scale_requests"]
        REDIS["🗄️ Redis 7 (AOF)\n· block:<hash>\n· chain (LIST)\n· leader:coordinator\n· lock:<prevHash>"]
    end
    
    subgraph GPU["🖥️ GPU Externo (k3s)"]
        GPUW["GPU Worker\nulisescasal/blockchain-\ngpu-worker:latest\n· CUDA sm_61\n· GTX 1050, 4GB\n· nvidia.com/gpu: 1"]
    end
    
    subgraph Cloud["☁️ GKE (Google Cloud)"]
        INGRESS["Ingress NGINX\ncustody-chain.darwin-\nconsulting.online\n· TLS Let's Encrypt"]
        HPA["HPA (1-10 réplicas)\nescala workers por CPU"]
    end
    
    %% Conexiones
    FE --> NGINX
    NGINX --> POOL
    NGINX --> COORD
    ST --> POOL
    CU --> POOL
    
    POOL <--> RABBIT
    COORD <--> RABBIT
    COORD <--> REDIS
    WORK <--> RABBIT
    GPUW <-.->|"WAN\namqp://35.202.170.91"| RABBIT
    WORK --> POOL
    
    POOL -.-> HPA
    HPA -.->|"escala"| WORK
    
    INGRESS --> FE
    
    %% Labels
    linkStyle 9,10,11,12 stroke-width:2px
```

---

## Despliegue e Infraestructura

### Local (Docker Compose)

```yaml
# docker-compose.yml — 7 servicios, red bridge
services:
  rabbitmq:   image: rabbitmq:3-management     # puertos 5672, 15672
  redis:      image: redis:7-alpine             # puerto 6379, AOF
  validator:  build: .                          # 2 réplicas
  coordinator: build: .                         # 2 réplicas, depende de rabbitmq+redis
  pool:       build: .                          # puerto 3001 expuesto
  worker:     build: .                          # 2 réplicas CPU
  frontend:   build: ./frontend                 # puerto 8080:80
```

```bash
# Iniciar todo
docker compose up -d --build

# Solo infra para tests
docker compose -f docker-compose.test.yml up -d
```

### Producción (GKE + Helm)

| Componente | Tipo | Réplicas | Node Pool |
|---|---|---|---|
| Coordinator | Deployment | 1 (escalable) | app-pool |
| Pool | Deployment | 1 | app-pool |
| Worker | Deployment | HPA (1-10) | app-pool |
| Validator | Deployment | 1 | app-pool |
| Frontend | Deployment | 1 | app-pool |
| RabbitMQ | Deployment | 1 | infra-pool (tainted) |
| Redis | Deployment | 1 | infra-pool (tainted) |

**Node pools (OpenTofu):**
- `infra-pool` — tainted `role=infra:NoSchedule` → RabbitMQ, Redis (con toleration)
- `app-pool` — Coordinator, Pool, Worker, Validator, Frontend

**Ingress:**
```yaml
host: custody-chain.darwin-consulting.online
tls: cert-manager + Let's Encrypt (acme-v02)
```

### GPU Externo (k3s)

```
GKE ─── RabbitMQ LoadBalancer ──► GPU Worker (k3s, namespace: g-amarillo)
       35.202.170.91:5672              │
                                       ├── Imagen: ulisescasal/blockchain-gpu-worker:latest
                                       ├── WORKER_TYPE=GPU
                                       ├── nvidia.com/gpu: 1
                                       ├── Strategy: Recreate
                                       └── CUDA sm_61 (GTX 1050)
```

**Build de imagen GPU (desde ARM Mac):**

```bash
docker buildx build \
  --platform linux/amd64 \
  -f Dockerfile.gpu \
  -t ulisescasal/blockchain-gpu-worker:latest \
  --push .
```

---

## Variables de Entorno

| Variable | Default | Servicio | Propósito |
|---|---|---|---|
| `SERVICE` | *(requerida)* | entrypoint | `coordinator`, `pool`, `worker`, `validator` |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672` | todos | Conexión RabbitMQ |
| `REDIS_URL` | `redis://redis:6379` | coordinator | Conexión Redis |
| `DIFFICULTY` | `0000` | coordinator, pool | Prefijo PoW (ej: 4 ceros) |
| `BLOCK_THRESHOLD` | `1` | pool | Txs para gatillar minería |
| `WORKER_TTL_MS` | `30000` | pool | TTL del registry de workers |
| `KEEPALIVE_INTERVAL_MS` | `10000` | worker | Heartbeat (ms) |
| `WORKER_TYPE` | `CPU` | worker | `CPU` o `GPU` |
| `COORDINATOR_ID` | hash(hostname) | coordinator | ID para elección Bully |
| `JWT_SECRET` | `pilar2-dev-secret` | coordinator | Secreto para firmar JWT |
| `DB_PATH` | `./data/auth.db` | coordinator | Ruta SQLite |
| `PILAR1_CPU_BINARY` | `./tpi/.../pow_cpu_range.js` | worker/miner | Ruta minero CPU |
| `PILAR1_GPU_BINARY` | `./tpi/.../pow_gpu_range` | worker/miner | Ruta minero GPU |
| `LOG_LEVEL` | `info` | todos | Nivel de log (pino) |

---

> **Documentación generada para el TP Integrador — Sistemas Distribuidos y Programación Paralela 2026**  
> **UNLu — Departamento de Ciencias Básicas — Dr. David Petrocelli**
