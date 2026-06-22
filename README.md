# Pilar 2 -- Infraestructura Blockchain Distribuida con Proof of Work

**Materia:** Sistemas Distribuidos y Programacion Paralela 2026 -- Universidad Nacional de Lujan  
**Profesor:** Dr. David Petrocelli  
**TP Integrador -- Pilar 2**

---

## Tabla de Contenidos

1. [Vision General del Proyecto](#1-vision-general-del-proyecto)
2. [Arquitectura](#2-arquitectura)
3. [Patrones de RabbitMQ](#3-patrones-de-rabbitmq)
4. [Eleccion de Lider (Algoritmo Bully)](#4-eleccion-de-lider-algoritmo-bully)
5. [Seguridad -- Firma Digital Ed25519 por Entidad](#5-seguridad----firma-digital-ed25519-por-entidad)
6. [Mecanismo de Auto-Escalado](#6-mecanismo-de-auto-escalado)
7. [Logging](#7-logging)
8. [Como Ejecutar](#8-como-ejecutar)
9. [Endpoints de la API](#9-endpoints-de-la-api)
10. [Testing](#10-testing)
11. [Estructura del Proyecto](#11-estructura-del-proyecto)
12. [Decisiones de Diseno](#12-decisiones-de-diseno)
13. [Configuracion](#13-configuracion)
14. [Frontend -- Panel de Control](#14-frontend----panel-de-control)

---

## 1. Vision General del Proyecto

Pilar 2 implementa la **capa de infraestructura distribuida** de una blockchain con Proof of Work disenada para el seguimiento de custodia de recursos de industrias extractivas (minerales y petroleo crudo). Es el segundo pilar del TP Integrador:

- **Pilar 1** (submodulo en `tpi/`) provee el motor de computacion PoW -- binarios de busqueda de hash MD5 para CPU y GPU.
- **Pilar 2** (este repositorio) envuelve al Pilar 1 en un sistema distribuido: validacion de transacciones, distribucion de tareas de mineria via RabbitMQ, persistencia de bloques en Redis, eleccion de lider entre replicas del coordinador, y firmas digitales Ed25519 por entidad.
- **Pilar 3** (futuro) agregara orquestacion con Kubernetes y auto-escalado con HPA.

### Por que blockchain para seguimiento de custodia?

En las industrias extractivas, las transferencias de custodia (de mina a planta, de planta a refineria, de refineria a terminal portuaria) involucran multiples partes y supervision regulatoria. Una blockchain provee:

- **Registro de auditoria inmutable** -- cada transferencia queda registrada permanentemente.
- **Consenso distribuido** -- no hay un unico punto de confianza; el PoW valida cada bloque.
- **Procedencia criptografica** -- las firmas Ed25519 prueban que entidad inicio cada transferencia, previniendo el repudio.

### Modelo de dominio

Cada transaccion representa una transferencia de custodia con los siguientes campos:

| Campo       | Descripcion                                     |
|-------------|-------------------------------------------------|
| `id`        | Identificador unico de la transaccion           |
| `id_lote`   | Identificador de lote (ej., `LOTE-2026-MIN-001`)|
| `origen`    | Entidad de origen (ej., `mina-san-juan`)         |
| `destino`   | Entidad de destino (ej., `planta-neuquen`)       |
| `cantidad`  | Cantidad en toneladas metricas                   |
| `tipo`      | Tipo de recurso: `MINERAL` o `CRUDO`             |
| `timestamp` | Marca temporal ISO 8601                          |
| `firma`     | Firma digital Ed25519 de la entidad de origen    |

---

## 2. Arquitectura

El sistema esta compuesto por 6 servicios orquestados via Docker Compose sobre una unica red bridge (`blockchain`):

| Servicio        | Puerto | Replicas | Descripcion                                                     |
|-----------------|--------|----------|-----------------------------------------------------------------|
| **RabbitMQ**    | 5672, 15672 | 1  | Broker de mensajes (AMQP + UI de gestion)                       |
| **Redis**       | 6379  | 1        | Persistencia de bloques (append-only) y estado de eleccion de lider |
| **Coordinator** | 3000  | 2        | Constructor de bloques con eleccion de lider -- verifica nonces, almacena bloques |
| **Pool**        | 3001  | 1        | Acumulador de transacciones, disparo de mineria por umbral      |
| **Worker**      | 3002  | 2        | Minero PoW -- consume tareas, ejecuta binarios del Pilar 1     |
| **Validator**   | 3003  | 2        | Validacion de esquema + firma de transacciones (libreria + HTTP)|

### Topologia de servicios y flujo de datos

```
                         +---------------------+
                         |   Cliente / Script  |
                         |  send-transactions  |
                         +----------+----------+
                                    |
                              POST /transaction
                                    |
                                    v
                         +----------+----------+
                         |        Pool         |
                         |   (puerto 3001)     |
                         |                     |
                         | - valida tx         |
                         |   (llama al         |
                         |    validator)       |
                         | - acumula en pool   |
                         |   de memoria        |
                         | - al alcanzar       |
                         |   umbral: publica   |
                         |   tareas            |
                         +----+----------+-----+
                              |          |
             cola keepalive   |          |  cola mining_tasks
             <----------------+          +------------------>
                                                            |
                    +-----------+                 +---------+----------+
                    |  Worker 1 | <--- tareas --> |      RabbitMQ      |
                    +-----------+                 |   (puerto 5672)    |
                    |  Worker 2 | <--- tareas --> |                    |
                    +-----------+                 +---------+----------+
                         |                                  |
                         |  cola mining_results             |
                         +--------------------------------->|
                                                            |
                                                  +---------+----------+
                                                  |    Coordinator     |
                                                  |   (puerto 3000)    |
                                                  |   [solo LIDER]     |
                                                  |                    |
                                                  | - consume result.  |
                                                  | - verifica nonce   |
                                                  | - adquiere lock    |
                                                  | - almacena bloque  |
                                                  | - publica en       |
                                                  |   block_confirmed  |
                                                  +---------+----------+
                                                            |
                                       +--------------------+--------------------+
                                       |                    |                    |
                                       v                    v                    v
                                 +-----------+        +-----------+        +-----------+
                                 |   Redis   |        |   Pool    |        | Coord (F) |
                                 | (almac.)  |        | (fanout)  |        | (seguidor)|
                                 +-----------+        +-----------+        +-----------+
```

### Patrones de comunicacion

- **Pool -> Validator**: Llamada directa a funcion (`validateTransaction()` se importa como libreria, no por HTTP).
- **Pool -> RabbitMQ**: Publica tareas de mineria en la cola `mining_tasks`.
- **Pool -> Coordinator**: HTTP GET `/status` para obtener el hash del ultimo bloque.
- **Workers -> RabbitMQ**: Consumen de `mining_tasks`, publican resultados en `mining_results`.
- **Workers -> RabbitMQ**: Publican heartbeats de keepalive en la cola `keepalive`.
- **Coordinator -> RabbitMQ**: El lider consume `mining_results`; publica en el exchange fanout `block_confirmed`.
- **Coordinator -> Redis**: Almacena bloques como hashes (`block:<hash>`), mantiene lista ordenada de la cadena.
- **Coordinator -> Redis**: Estado de eleccion de lider via clave `leader:coordinator` con TTL de heartbeat.
- **Coordinator -> Redis**: Lock atomico de commit via `SET NX EX` sobre `lock:<prevHash>`.

---

## 3. Patrones de RabbitMQ

### Cola de Mensajes -- Punto a Punto

La cola `mining_tasks` implementa distribucion de trabajo con `prefetch(1)`. Cada worker toma exactamente una tarea por vez, asegurando distribucion equitativa de carga entre workers con diferentes velocidades de procesamiento.

```
Pool  -->  [mining_tasks]  -->  Worker 1
                           -->  Worker 2
                           -->  Worker N
```

Los workers tambien publican resultados en `mining_results`, que solo el coordinador lider consume.

### Pub/Sub -- Exchange Fanout

El exchange `block_confirmed` es de tipo fanout. Cuando un bloque se confirma, el coordinador lider publica en este exchange y todos los suscriptores (pool, coordinadores seguidores) reciben la notificacion via colas exclusivas auto-delete.

```
Coordinator (lider)  -->  {block_confirmed}  -->  Pool (suscriptor)
                                              -->  Coordinator (seguidor)
```

### Cola de Mensajes Muertos (Dead Letter Queue)

Los mensajes fallidos de `mining_results` se redirigen a un exchange de mensajes muertos (`dlx_mining`) que los entrega a `mining_results_dlq`. El consumidor de DLQ del coordinador los registra para observabilidad.

```
mining_results  --[nack, sin reencolar]-->  dlx_mining  -->  mining_results_dlq
```

### Reintento con Backoff Exponencial

La utilidad `withRetry()` en `shared/retry.js` envuelve cualquier funcion asincrona con logica de reintento configurable:

- Por defecto: 4 reintentos con backoff exponencial (1s, 2s, 4s, 8s).
- Se utiliza cuando el coordinador procesa resultados de mineria.
- El helper de conexion AMQP (`shared/amqp.js`) tambien usa backoff exponencial (hasta 6 reintentos, tope de 32s) para la conexion inicial al broker.

### Inventario completo de colas y exchanges

| Nombre                 | Tipo     | Durable | Proposito                                          |
|------------------------|----------|---------|-----------------------------------------------------|
| `mining_tasks`         | Cola     | Si      | Distribucion de tareas PoW a workers                |
| `mining_results`       | Cola     | Si      | Resultados de workers al coordinador (con DLX)       |
| `mining_results_dlq`   | Cola     | Si      | Cola de mensajes muertos para procesamiento fallido |
| `keepalive`            | Cola     | No      | Heartbeats de workers (TTL: 30s)                    |
| `scale_requests`       | Cola     | Si      | Eventos de auto-escalado cuando no hay workers      |
| `block_confirmed`      | Exchange | No      | Fanout -- notificaciones de bloques confirmados     |
| `dlx_mining`           | Exchange | Si      | Direct -- exchange de mensajes muertos para mining_results |

---

## 4. Eleccion de Lider (Algoritmo Bully)

El coordinador se ejecuta en 2 replicas. Solo el **lider** consume resultados de mineria y escribe bloques. El seguidor queda en espera para failover.

### Como funciona

1. Cada coordinador deriva un ID numerico a partir del hostname de su contenedor (`deriveId(os.hostname())`), o lo lee de `COORDINATOR_ID`.
2. Al iniciar, el coordinador verifica en Redis si existe una clave de lider (`leader:coordinator`).
3. Si no hay lider, inicia una eleccion publicando en el canal `election:start`.
4. Los coordinadores con un ID **mayor** responden en `election:answer`, suprimiendo al iniciador.
5. Si ningun coordinador con ID mayor responde dentro de 3 segundos (`ELECTION_TIMEOUT`), el iniciador se declara ganador en `election:victory` y setea la clave en Redis con un TTL de 15 segundos.
6. El lider envia heartbeats cada 5 segundos, renovando el TTL.
7. Los seguidores consultan la clave del lider cada 5 segundos. Si la clave expira (caida del lider), se inicia una nueva eleccion.

### Canales pub/sub de Redis

| Canal              | Direccion           | Payload              |
|--------------------|---------------------|----------------------|
| `election:start`   | Iniciador -> Todos  | `{ id: <number> }`  |
| `election:answer`  | Respondedor -> Inic | `{ id, to }`        |
| `election:victory` | Ganador -> Todos    | `{ id: <number> }`  |

### Claves de Redis

| Clave                | Tipo   | TTL | Proposito                              |
|----------------------|--------|-----|----------------------------------------|
| `leader:coordinator` | String | 15s | ID del lider actual (renovado por heartbeat) |
| `lock:<prevHash>`    | String | 30s | Lock atomico de commit (SET NX EX)     |
| `block:<hash>`       | Hash   | --  | Campos de datos del bloque             |
| `chain`              | List   | --  | Referencias ordenadas de hashes de bloques |

### Por que importa el escritor unico

Con multiples replicas del coordinador consumiendo `mining_results`, son posibles escrituras duplicadas de bloques. La eleccion de lider asegura:

- Solo el lider consume `mining_results` (el consumer del seguidor se cancela al ser degradado).
- El lock `SET NX EX` de Redis sobre `lock:<prevHash>` actua como segunda red de seguridad -- incluso durante transiciones de lider, solo el primer escritor tiene exito para una altura de bloque dada.

---

## 5. Seguridad -- Firma Digital Ed25519 por Entidad

### Por que se reemplazo HMAC

La implementacion inicial usaba un secreto compartido HMAC-SHA256 para autenticacion de transacciones. Esto tiene un problema fundamental para un sistema de custodia multi-entidad: **cualquier parte con el secreto compartido puede falsificar transacciones en nombre de cualquier otra parte**. El modulo HMAC (`shared/hmac.js`) se conserva por compatibilidad hacia atras pero no se usa en el pipeline de validacion actual.

### Como funciona la firma Ed25519

Cada entidad del mundo real (mina, planta, refineria, terminal) tiene su propio par de claves Ed25519 almacenado en el directorio `keys/`:

1. **Generacion de claves**: `scripts/generate-keys.js` crea pares de claves para todas las entidades de demostracion.
2. **Firma**: La entidad de origen firma los campos canonicalizados de la transaccion (excluyendo `firma`) con su clave privada. La firma es una firma Ed25519 codificada en base64.
3. **Verificacion**: El validador carga la clave publica de la entidad de origen desde `keys/<entidad>.pub.pem` y verifica la firma contra la transaccion canonicalizada.

### Canonicalizacion

Para prevenir problemas de ordenamiento de claves en JSON, `shared/crypto.js` construye un objeto deterministico con orden fijo de campos antes de firmar:

```javascript
{ id, id_lote, origen, destino, cantidad, tipo, timestamp }
```

El campo `firma` se excluye de la canonicalizacion (es la firma en si misma).

### Entidades de demostracion

| Entidad                      | Rol                  | Archivos                       |
|------------------------------|----------------------|--------------------------------|
| `mina-san-juan`              | Operacion minera     | `mina-san-juan.pem`, `.pub.pem`|
| `planta-neuquen`             | Planta procesadora   | `planta-neuquen.pem`, `.pub.pem`|
| `refineria-bahia-blanca`     | Refineria            | `refineria-bahia-blanca.pem`, `.pub.pem`|
| `operador-pozo-mendoza`      | Operador de pozo     | `operador-pozo-mendoza.pem`, `.pub.pem`|
| `terminal-puerto-rosario`    | Terminal portuaria   | `terminal-puerto-rosario.pem`, `.pub.pem`|

---

## 6. Mecanismo de Auto-Escalado

Cuando el pool detecta **cero workers activos** al momento de disparar la mineria:

1. Reduce la dificultad en un caracter (fallback para hacer la mineria viable sin workers).
2. Publica un evento `scale_up` en la cola `scale_requests` de RabbitMQ con metadatos:
   ```json
   {
     "type": "scale_up",
     "service": "worker",
     "reason": "no_active_workers",
     "requested_count": 2,
     "timestamp": "2026-06-20T12:00:00.000Z"
   }
   ```
3. Expone el estado actual de escalado via `GET /scale/status`.

### Respuesta de GET /scale/status

```json
{
  "active_workers": 0,
  "gpu_workers": 0,
  "cpu_workers": 0,
  "scale_needed": true,
  "last_scale_request": "2026-06-20T12:00:00.000Z"
}
```

### Script complementario

`scripts/auto-scale.js` es un daemon de polling que periodicamente consulta `/scale/status` y registra si se necesita escalado. En el Pilar 2, solo registra logs. En el Pilar 3, esto se integrara con Kubernetes HPA para disparar escalado real de pods.

---

## 7. Logging

Todos los servicios usan **Pino** para logging estructurado en JSON. Cada servicio escribe a dos destinos simultaneamente via `pino.multistream`:

1. **stdout** -- para recoleccion de logs de Docker y `docker compose logs`.
2. **Disco** -- `logs/<SERVICIO>.log` (ej., `logs/coordinator.log`, `logs/pool.log`).

El directorio `logs/` esta montado como volumen desde el host, por lo que los logs persisten entre reinicios de contenedores.

### Nivel de log

Configurado via la variable de entorno `LOG_LEVEL` (por defecto: `info`). Soporta niveles estandar de Pino: `trace`, `debug`, `info`, `warn`, `error`, `fatal`.

### Ubicacion de archivos de log

| Servicio    | Archivo de log          |
|-------------|-------------------------|
| Coordinator | `logs/coordinator.log`  |
| Pool        | `logs/pool.log`         |
| Worker      | `logs/worker.log`       |
| Validator   | `logs/validator.log`    |

---

## 8. Como Ejecutar

### Requisitos previos

- Docker y Docker Compose
- Node.js 20+ (para ejecutar scripts y tests localmente)

### Paso 1: Clonar el repositorio

```bash
git clone --recurse-submodules https://github.com/UlisesCasal/Pilar2.git
cd Pilar2
```

Si ya se clono sin submodulos:

```bash
git submodule update --init --recursive
```

### Paso 2: Generar pares de claves de entidades

```bash
npm install
node scripts/generate-keys.js
```

Esto crea pares de claves Ed25519 en `keys/` para todas las entidades de demostracion. Las claves se montan como solo lectura en los contenedores del pool y el validator.

### Paso 3: Iniciar el sistema

```bash
docker compose up --build
```

Esto inicia los 6 servicios (RabbitMQ, Redis, 2 coordinadores, 1 pool, 2 workers, 2 validadores) en la red `blockchain`.

Esperar a que pasen los health checks:

```
rabbitmq  | ... Server startup complete
redis     | * Ready to accept connections
coordinator  | {"msg":"Listening on port 3000"}
pool         | {"msg":"Listening on port 3001"}
worker       | {"msg":"Consuming mining_tasks"}
```

### Paso 4: Enviar transacciones de prueba

```bash
node scripts/send-transactions.js 10
```

Esto envia 10 transacciones firmadas al pool en `http://localhost:3001`. El argumento es opcional y por defecto es 10 (coincide con el `BLOCK_THRESHOLD` por defecto).

Salida esperada:

```
Enviando 10 transacciones a http://localhost:3001...

ok tx-1 [MINERAL] mina-san-juan -> planta-neuquen 100tn  ->  HTTP 201 | pending: 1
ok tx-2 [CRUDO] planta-neuquen -> refineria-bahia-blanca 150tn  ->  HTTP 201 | pending: 2
...
ok tx-10 [CRUDO] ... ->  HTTP 201 | pending: 0

Esperando que el bloque se mine...

=== Estado del Coordinator ===
{
  "nct": "OK",
  "chain_length": 2,
  "pending_tx": 0,
  "last_block": "...",
  "role": "leader"
}
```

### Paso 5: Verificar el sistema

```bash
# Estado del coordinador
curl http://localhost:3000/status

# Estado del pool
curl http://localhost:3001/status

# Salud de Redis
curl http://localhost:3000/redis/status

# Salud de RabbitMQ
curl http://localhost:3000/rabbitmq/status

# Estado de escalado de workers
curl http://localhost:3001/scale/status

# UI de gestion de RabbitMQ
open http://localhost:15672  # guest/guest
```

---

## 9. Endpoints de la API

### Coordinator (puerto 3000)

| Metodo | Ruta               | Descripcion                                              | Respuesta de ejemplo |
|--------|--------------------|----------------------------------------------------------|----------------------|
| POST   | `/mine`            | Disparar mineria para un lote de transacciones           | `{ "status": "mining started", "tasks": 2 }` |
| POST   | `/transaction`     | Reenviar una transaccion al pool para validacion         | `{ "accepted": true, "pending": 5 }` |
| POST   | `/sign`            | Firmar una transaccion con la clave privada Ed25519 de una entidad | `{ ...tx, "firma": "<base64>" }` |
| GET    | `/status`          | Health check con info de la cadena y rol lider/seguidor  | `{ "nct": "OK", "chain_length": 3, "pending_tx": 0, "last_block": "abc...", "role": "leader" }` |
| GET    | `/redis/status`    | Conectividad de Redis y cantidad de bloques almacenados  | `{ "redis": "OK", "blocks_stored": 3 }` |
| GET    | `/rabbitmq/status` | Conectividad de RabbitMQ y profundidad de cola mining_tasks | `{ "rabbitmq": "OK", "queue_depth": 0 }` |

### Pool (puerto 3001)

| Metodo | Ruta               | Descripcion                                              | Respuesta de ejemplo |
|--------|--------------------|----------------------------------------------------------|----------------------|
| POST   | `/transaction`     | Validar y acumular una transaccion; dispara mineria al alcanzar umbral | `{ "accepted": true, "pending": 5 }` |
| GET    | `/status`          | Salud del pool, cantidad pendiente y desglose de workers | `{ "pool": "OK", "pending": 3, "gpu_workers": 0, "cpu_workers": 2 }` |
| GET    | `/scale/status`    | Estado de escalado de workers para integracion con auto-escalado | `{ "active_workers": 2, "gpu_workers": 0, "cpu_workers": 2, "scale_needed": false, "last_scale_request": null }` |

### Worker (puerto 3002)

| Metodo | Ruta               | Descripcion                                              | Respuesta de ejemplo |
|--------|--------------------|----------------------------------------------------------|----------------------|
| GET    | `/worker/status`   | Liveness del worker, ID, tipo y tasa de hash             | `{ "worker": "OK", "worker_id": "abc-123", "type": "CPU", "hash_rate": 0, "last_task": null }` |

### Validator (puerto 3003)

| Metodo | Ruta               | Descripcion                                              | Respuesta de ejemplo |
|--------|--------------------|----------------------------------------------------------|----------------------|
| POST   | `/validate`        | Validar una transaccion (esquema + firma)                | `{ "valid": true, "errors": [] }` |
| GET    | `/health`          | Health check del validador                               | `{ "status": "OK", "service": "validator" }` |

---

## 10. Testing

### Tests unitarios

```bash
npm test
# o explicitamente:
npm run test:unit
```

15 suites de test cubriendo todos los modulos:

| Archivo de test                   | Modulo bajo prueba                   |
|-----------------------------------|--------------------------------------|
| `amqp.test.js`                    | `shared/amqp.js` -- reintento de conexion |
| `block.test.js`                   | `shared/block.js` -- construccion de payload/bloque |
| `crypto.test.js`                  | `shared/crypto.js` -- firma/verificacion Ed25519 |
| `entity-keys.test.js`             | `shared/entity-keys.js` -- carga de claves |
| `hash.test.js`                    | `shared/hash.js` -- wrapper de MD5 |
| `leader-election.test.js`         | `coordinator/leader-election.js` |
| `logger.test.js`                  | `shared/logger.js` -- configuracion de Pino |
| `miner.test.js`                   | `worker/miner.js` -- invocacion del binario Pilar 1 |
| `nonce-splitter.test.js`          | `pool/nonce-splitter.js` -- division de rangos |
| `rabbitmq-coordinator.test.js`    | `coordinator/rabbitmq.js` -- setup de colas |
| `redis.test.js`                   | `coordinator/redis.js` -- almacenamiento de bloques |
| `retry.test.js`                   | `shared/retry.js` -- backoff exponencial |
| `transaction-pool.test.js`        | `pool/transaction-pool.js` -- add/flush/size |
| `validator.test.js`               | `validator/index.js` -- validacion de esquema + firma |
| `worker-registry.test.js`         | `pool/worker-registry.js` -- liveness basado en TTL |

### Tests de integracion

Los tests de integracion requieren RabbitMQ y Redis ejecutandose:

```bash
# Iniciar solo la infraestructura
docker compose -f docker-compose.test.yml up -d

# Iniciar servicios localmente
SERVICE=validator node entrypoint.js &
SERVICE=coordinator node entrypoint.js &
SERVICE=pool node entrypoint.js &
SERVICE=worker node entrypoint.js &

# Ejecutar tests de integracion
npm run test:integration

# Apagar
docker compose -f docker-compose.test.yml down
```

O usar el stack completo de Docker Compose y ejecutar:

```bash
INTEGRATION=true npx jest tests/integration
```

### Modo watch

```bash
npm run test:watch
```

### Cobertura

```bash
npx jest --coverage
```

La cobertura se recolecta de: `shared/`, `validator/`, `coordinator/`, `pool/`, `worker/`.

---

## 11. Estructura del Proyecto

```
Pilar2/
|-- docker-compose.yml            # Stack completo de 6 servicios
|-- docker-compose.test.yml       # Solo infraestructura (RabbitMQ + Redis) para tests de integracion
|-- Dockerfile                    # Imagen unica multi-servicio (Node 20 Alpine)
|-- entrypoint.js                 # Router de servicios -- lee la variable de entorno SERVICE
|-- package.json                  # Dependencias y scripts
|-- jest.config.js                # Configuracion de tests (proyectos unit + integration)
|-- .gitmodules                   # Referencia al submodulo Pilar 1
|
|-- coordinator/
|   |-- index.js                  # Servidor HTTP, /mine, /status, /transaction, /sign, startup
|   |-- leader-election.js        # Algoritmo Bully via pub/sub de Redis
|   |-- rabbitmq.js               # Declaraciones de colas/exchanges, publicar/consumir
|   |-- redis.js                  # Almacenamiento de bloques, consulta de cadena, lock atomico
|
|-- pool/
|   |-- index.js                  # Servidor HTTP, /transaction, disparo de mineria por umbral
|   |-- transaction-pool.js       # Acumulador de transacciones en memoria (add/flush/size)
|   |-- nonce-splitter.js         # Divide [0, MAX_SAFE_INTEGER] en N rangos para workers
|   |-- worker-registry.js        # Seguimiento de liveness de workers basado en TTL
|
|-- worker/
|   |-- index.js                  # Servidor HTTP, /worker/status, loop de keepalive
|   |-- consumer.js               # Consumidor de RabbitMQ -- toma tareas, publica resultados
|   |-- miner.js                  # Ejecuta binario CPU/GPU del Pilar 1 como proceso hijo
|
|-- validator/
|   |-- index.js                  # Logica de validacion de transacciones (esquema + Ed25519)
|   |-- server.js                 # Servidor HTTP, /validate, /health
|
|-- shared/
|   |-- amqp.js                   # Conexion a RabbitMQ con backoff exponencial
|   |-- block.js                  # Serializacion de payload y ensamblado de bloques
|   |-- crypto.js                 # Firma/verificacion Ed25519 con canonicalizacion
|   |-- entity-keys.js            # Carga de pares de claves de entidades desde keys/
|   |-- hash.js                   # Wrapper de MD5 (funcion hash del PoW)
|   |-- hmac.js                   # HMAC-SHA256 (legacy, reemplazado por Ed25519)
|   |-- logger.js                 # Logger estructurado Pino (stdout + disco)
|   |-- retry.js                  # Utilidad de reintento con backoff exponencial
|   |-- schema.js                 # Constantes del esquema de transacciones (tipos, campos requeridos)
|
|-- frontend/
|   |-- package.json              # React 18 + Vite + Tailwind CSS
|   |-- vite.config.js            # Configuracion de Vite con proxies de API
|   |-- tailwind.config.js        # Sistema de diseno (colores, fuentes, animaciones)
|   |-- index.html                # Punto de entrada HTML
|   |-- src/
|       |-- App.jsx               # Layout principal, selector de roles, navegacion
|       |-- index.css             # Estilos globales, mesh gradient, glass morphism
|       |-- api/
|       |   |-- client.js         # Cliente HTTP con proxies a coordinator y pool
|       |-- components/
|       |   |-- OverviewBar.jsx   # Barra de estado con metricas en tiempo real
|       |-- views/
|           |-- TransactionForm.jsx  # Pipeline de envio de transacciones
|           |-- BlockExplorer.jsx    # Visualizacion de la cadena de bloques
|           |-- CustodyTracker.jsx   # Grafo de flujo de custodia con deteccion de drift
|           |-- MiningMonitor.jsx    # Sala de control de mineria
|
|-- scripts/
|   |-- generate-keys.js          # Genera pares de claves Ed25519 para entidades de demo
|   |-- send-transactions.js      # Envia N transacciones firmadas al pool
|   |-- auto-scale.js             # Daemon de polling para estado de escalado (prep Pilar 3)
|
|-- keys/                         # Pares de claves Ed25519 (generadas, gitignored en prod)
|   |-- mina-san-juan.pem
|   |-- mina-san-juan.pub.pem
|   |-- ...
|
|-- tests/
|   |-- unit/                     # 15 suites de test Jest (~1427 lineas)
|   |-- integration/              # Test end-to-end del ciclo completo de mineria
|
|-- logs/                         # Archivos de log de servicios (volumen montado, gitignored)
|
|-- tpi/                          # Submodulo Git -- Pilar 1 (binarios PoW CPU/GPU)
```

---

## 12. Decisiones de Diseno

### Imagen Docker unica, multiples servicios

Los cuatro servicios de aplicacion (coordinator, pool, worker, validator) comparten un unico `Dockerfile` y usan la variable de entorno `SERVICE` para seleccionar el punto de entrada via `entrypoint.js`. Esto reduce el tiempo de build y la cantidad de imagenes manteniendo los servicios escalables independientemente via `deploy.replicas`.

### MD5 como funcion hash del PoW

MD5 se usa intencionalmente en lugar de SHA-256. Los benchmarks del Pilar 1 de la materia comparan rendimiento CPU vs GPU en hashing MD5. El Pilar 2 reutiliza esos mismos binarios directamente (`tpi/pilar1/Hit7/CPU/pow_cpu_range.js` y `GPU/pow_gpu_range`), manteniendo continuidad entre pilares.

### Division de rangos de nonce

En lugar de que los workers compitan sobre el mismo espacio de nonce, `nonce-splitter.js` divide `[0, Number.MAX_SAFE_INTEGER]` en N rangos contiguos y no superpuestos. Cada worker busca exclusivamente en su rango asignado, eliminando computacion redundante.

### Validator como libreria + HTTP

El validador se usa de dos formas:
- **Importacion como libreria** -- el pool importa `validateTransaction()` directamente para validacion con latencia cero.
- **Servicio HTTP** -- el validador se ejecuta como servicio standalone con `POST /validate` para clientes externos o validacion futura inter-servicios.

Este enfoque dual evita saltos de red innecesarios dentro de Docker mientras se expone un servicio de validacion independiente.

### Modelo de datos en Redis

Los bloques se almacenan como hashes de Redis (`HSET block:<block_hash> ...`) para acceso a nivel de campo. El orden de la cadena se mantiene como una lista de Redis (`RPUSH chain <block_hash>`). Esto permite busqueda de bloques en O(1) y recorrido de cadena en O(n).

### Lock atomico de commit

El patron `SET NX EX` sobre `lock:<prevHash>` asegura que incluso durante transiciones de lider, solo una instancia del coordinador pueda confirmar un bloque para una altura de cadena dada. El TTL de 30 segundos previene retencion permanente del lock si el escritor se cae.

### Migracion de HMAC a Ed25519

El sistema migro de HMAC-SHA256 (secreto compartido) a Ed25519 (pares de claves por entidad) porque un secreto compartido no puede proveer no-repudio en un sistema de custodia multi-entidad. El modulo HMAC se conserva pero no es utilizado por el pipeline de validacion actual.

### Abstraccion de tipo de worker

Los workers declaran su tipo (`CPU` o `GPU`) via variable de entorno. El modulo de mineria selecciona el binario apropiado del Pilar 1 al iniciar. Esto permite despliegues mixtos de workers CPU/GPU sin cambios en el codigo.

---

## 13. Configuracion

Toda la configuracion se realiza via variables de entorno. Se proveen valores por defecto para desarrollo local con Docker Compose.

### Coordinator

| Variable             | Valor por defecto                    | Descripcion                              |
|----------------------|--------------------------------------|------------------------------------------|
| `SERVICE`            | --                                   | Debe ser `coordinator`                   |
| `RABBITMQ_URL`       | `amqp://guest:guest@rabbitmq:5672`   | URL de conexion a RabbitMQ               |
| `REDIS_URL`          | `redis://redis:6379`                 | URL de conexion a Redis                  |
| `DIFFICULTY`         | `0000`                               | Prefijo de dificultad PoW (cantidad de ceros iniciales) |
| `POOL_URL`           | `http://pool:3001`                   | URL del servicio Pool para reenvio de transacciones |
| `PORT_COORDINATOR`   | `3000`                               | Puerto HTTP de escucha                   |
| `LOG_LEVEL`          | `info`                               | Nivel de log de Pino                     |
| `COORDINATOR_ID`     | derivado del hostname                | ID numerico para eleccion de lider       |

### Pool

| Variable             | Valor por defecto                    | Descripcion                              |
|----------------------|--------------------------------------|------------------------------------------|
| `SERVICE`            | --                                   | Debe ser `pool`                          |
| `RABBITMQ_URL`       | `amqp://guest:guest@rabbitmq:5672`   | URL de conexion a RabbitMQ               |
| `BLOCK_THRESHOLD`    | `10`                                 | Cantidad de transacciones para disparar mineria |
| `COORDINATOR_URL`    | `http://coordinator:3000`            | URL del Coordinator para hash del ultimo bloque |
| `WORKER_TTL_MS`      | `30000`                              | Timeout de heartbeat de workers en milisegundos |
| `PORT_POOL`          | `3001`                               | Puerto HTTP de escucha                   |
| `DIFFICULTY`         | `0000`                               | Dificultad PoW (usado en fallback con 0 workers) |
| `LOG_LEVEL`          | `info`                               | Nivel de log de Pino                     |

### Worker

| Variable               | Valor por defecto                             | Descripcion                              |
|------------------------|-----------------------------------------------|------------------------------------------|
| `SERVICE`              | --                                            | Debe ser `worker`                        |
| `RABBITMQ_URL`         | `amqp://guest:guest@rabbitmq:5672`            | URL de conexion a RabbitMQ               |
| `PILAR1_CPU_BINARY`    | `./tpi/pilar1/Hit7/CPU/pow_cpu_range.js`      | Ruta al binario CPU PoW del Pilar 1      |
| `PILAR1_GPU_BINARY`    | `./tpi/pilar1/Hit7/GPU/pow_gpu_range`         | Ruta al binario GPU PoW del Pilar 1      |
| `WORKER_TYPE`          | `CPU`                                         | Tipo de worker: `CPU` o `GPU`            |
| `WORKER_ID`            | UUID auto-generado                            | Identificador unico del worker           |
| `KEEPALIVE_INTERVAL_MS`| `10000`                                       | Intervalo de heartbeat en milisegundos   |
| `PORT_WORKER`          | `3002`                                        | Puerto HTTP de escucha                   |
| `LOG_LEVEL`            | `info`                                        | Nivel de log de Pino                     |

### Validator

| Variable             | Valor por defecto | Descripcion                              |
|----------------------|-------------------|------------------------------------------|
| `SERVICE`            | --                | Debe ser `validator`                     |
| `PORT_VALIDATOR`     | `3003`            | Puerto HTTP de escucha                   |
| `LOG_LEVEL`          | `info`            | Nivel de log de Pino                     |

### Overrides de Docker Compose

Estas variables pueden setearse en `.env` o pasarse directamente:

| Variable           | Valor por defecto | Usado por          |
|--------------------|-------------------|--------------------|
| `DIFFICULTY`       | `0000`            | coordinator, pool  |
| `BLOCK_THRESHOLD`  | `10`              | pool               |

---

## 14. Frontend -- Panel de Control

El frontend es una aplicacion de pagina unica (SPA) que funciona como panel de control para operar, auditar y monitorear la blockchain. Permite enviar transacciones firmadas, explorar la cadena de bloques, rastrear la custodia de recursos con deteccion de anomalias, y supervisar la infraestructura de mineria en tiempo real.

### Stack tecnologico

| Componente    | Tecnologia                           |
|---------------|--------------------------------------|
| Framework     | React 18                             |
| Bundler       | Vite 5                               |
| Estilos       | Tailwind CSS 3.4                     |
| Iconografia   | Lucide React                         |
| Routing       | Ninguno (navegacion por estado local)|
| State management | Ninguno (useState nativo de React)|

No se utilizan librerias de routing ni de manejo de estado externo. La navegacion se resuelve con estado local de React (`useState`) y la seleccion de rol determina las vistas disponibles.

### Tipografia

| Uso               | Fuente          |
|--------------------|-----------------|
| Cuerpo de texto   | Plus Jakarta Sans|
| Encabezados       | Space Grotesk    |
| Datos tecnicos    | JetBrains Mono   |

### Sistema de diseno

El diseno sigue una estetica industrial oscura denominada "Hybrid Dark + Gold", pensada para el dominio de industria extractiva.

**Superficie y fondo:**

- Fondo OLED oscuro (`#0C0A09`) con mesh gradient (orbes radiales amber/emerald/sky) y overlay de ruido
- Glass morphism en el sidebar y la barra de estado (`backdrop-blur` + transparencia)
- Bordes hairline `ring-1 ring-white/6%` en lugar de bordes solidos

**Paleta de colores semanticos:**

| Token     | Color          | Codigo  | Uso                                          |
|-----------|----------------|---------|----------------------------------------------|
| Mineral   | Amber          | #D97706 | Operaciones con minerales, acento primario   |
| Crude     | Sky blue       | #0EA5E9 | Operaciones con petroleo crudo               |
| Verified  | Emerald        | #10B981 | Estados confirmados/verificados              |
| Anomaly   | Red            | #EF4444 | Errores y deteccion de drift                 |
| Pending   | Amber          | #F59E0B | Estados pendientes                           |

**Animaciones:**

- Easing con fisica de resorte: `cubic-bezier(0.32, 0.72, 0, 1)`
- Entrada con fade-up y desenfoque (blur entry)

### Navegacion basada en roles

La aplicacion define tres roles, cada uno con su color de acento y vistas especificas:

| Rol        | Acento   | Vistas disponibles                           | Descripcion                              |
|------------|----------|----------------------------------------------|------------------------------------------|
| Operador   | Amber    | Nueva Transferencia, Trazabilidad            | Registrar transferencias de custodia     |
| Auditor    | Emerald  | Explorador, Trazabilidad                     | Inspeccionar la cadena y trazabilidad    |
| Monitor    | Sky blue | Mineria, Explorador                          | Observar infraestructura de mineria      |

El sidebar muestra un selector de rol con descripcion contextual. Al cambiar de rol, la navegacion se actualiza automaticamente para mostrar solo las vistas permitidas.

### Vistas

#### OverviewBar (Barra de Estado)

Barra horizontal compacta con glass morphism que se muestra en la parte superior del area de contenido principal, independientemente de la vista activa.

Muestra 4 metricas inline:

| Metrica    | Fuente                     | Descripcion                              |
|------------|----------------------------|------------------------------------------|
| Bloques    | `GET /status`              | Longitud actual de la cadena             |
| Workers    | `GET /status`              | Cantidad de workers activos              |
| Pool       | `GET /pool/status`         | Transacciones pendientes con gauge RingChart SVG |
| Dificultad | `GET /status`              | Prefijo de dificultad PoW actual         |

Realiza polling cada 5 segundos contra los endpoints del coordinador y el pool.

#### TransactionForm (Pipeline de Transferencia)

Vista principal del rol Operador. Implementa un flujo tipo pipeline con 5 etapas visualizadas como un stepper SVG con lineas punteadas animadas:

```
Completar --> Firmar --> Pool --> Minar --> Confirmar
```

**Componentes del formulario:**

- Toggle de tipo de recurso: `MINERAL` / `CRUDO`
- Identificador de lote
- Entidades de origen y destino (seleccion)
- Cantidad en toneladas metricas

**Indicadores de estado:**

- Gauge del pool: RingChart SVG mostrando capacidad pendiente/umbral
- TxTracker: sigue las transacciones enviadas a traves de su ciclo de vida (`pending` -> `mining` -> `confirmed`)
- Boton "Minar ahora" para forzar el disparo de mineria sin esperar al umbral

#### BlockExplorer (Cadena Visual)

Vista de exploracion de la cadena de bloques con tres componentes principales:

- **Visualizacion SVG de la cadena**: nodos de bloques conectados horizontalmente, desplazables, con clic para seleccionar
- **Tarjetas expandibles de bloques**: muestran detalle de las transacciones contenidas en cada bloque
- **Indicadores de tipo de transaccion**: punto amber para `MINERAL`, punto sky para `CRUDO`
- **Sidebar de integridad de cadena**: RingChart mostrando el estado de integridad

#### CustodyTracker (Grafo de Flujo)

La vista mas completa del sistema. Visualiza el flujo de custodia entre entidades como un grafo dirigido interactivo.

**Grafo de flujo SVG:**

- Entidades representadas como nodos
- Transferencias como aristas dirigidas animadas (lineas punteadas que fluyen en la direccion de la transferencia)
- Etiquetas en las aristas mostrando cantidad + unidad en los puntos medios de las curvas de Bezier
- Transferencias pendientes mostradas como nodos/aristas punteadas en amber

**Deteccion de drift:**

- Las aristas donde la cantidad cambio entre origen y destino se marcan en ROJO con efecto glow y animacion acelerada
- Esto permite detectar visualmente anomalias en la cadena de custodia

**Componentes complementarios:**

- **Grafico de barras de cantidad**: barras horizontales mostrando la cantidad en cada paso de transferencia (sidebar)
- **Linea temporal**: debajo del grafo, muestra la secuencia cronologica de transferencias

#### MiningMonitor (Sala de Control)

Vista de monitoreo de infraestructura con layout de grilla 2x2:

| Cuadrante          | Contenido                                                |
|--------------------|----------------------------------------------------------|
| Workers            | Grilla visual de puntos (GPU = sky, CPU = amber)         |
| Pool y Cola        | RingChart + barra de capacidad                           |
| Coordinator        | Badge de lider/seguidor, algoritmo de eleccion           |
| Salud del Sistema  | DLQ, auto-escalado, ultimo request                       |

### Componentes compartidos

**RingChart**

Componente SVG reutilizable de grafico de dona (donut chart). Implementa transiciones animadas via `stroke-dashoffset`. Se usa en OverviewBar, TransactionForm, BlockExplorer y MiningMonitor para mostrar proporciones y capacidades.

**usePolling**

Hook personalizado de React para fetching periodico de datos. Intervalo por defecto de 5 segundos. Maneja limpieza automatica del intervalo en el desmontaje del componente.

### Cliente API

El frontend se comunica con el backend a traves de dos proxies configurados en Vite:

| Prefijo de ruta       | Destino                    | Servicio    |
|-----------------------|----------------------------|-------------|
| `/api/coordinator`    | `http://localhost:3000`    | Coordinator |
| `/api/pool`           | `http://localhost:3001`    | Pool        |

En desarrollo, Vite redirige las peticiones automaticamente. En produccion (Docker), Nginx maneja el proxy reverso.

### Firma Ed25519 desde el Frontend

El flujo de firma desde la perspectiva del usuario:

1. El usuario completa el formulario y presiona "Firmar y Enviar al Pool".
2. El frontend construye una transaccion sin firmar con `crypto.randomUUID()` como ID.
3. El frontend llama a `POST /api/coordinator/sign` con el nombre de la entidad y la transaccion.
4. El coordinador firma con la clave privada Ed25519 de la entidad y devuelve la transaccion con el campo `firma`.
5. El frontend envia la transaccion firmada a `POST /api/pool/transaction`.
6. El TxTracker realiza polling del ciclo de vida hasta la confirmacion.

Este flujo delega la firma al backend (que tiene acceso a las claves privadas), manteniendo las claves fuera del navegador.

### Como ejecutar el frontend

```bash
cd frontend
npm install
npm run dev    # Servidor de desarrollo Vite en http://localhost:5173
npm run build  # Build de produccion en dist/
```

El servidor de desarrollo proxea las llamadas a la API hacia los servicios backend (coordinator:3000, pool:3001).

### Despliegue con Docker

El frontend se despliega con un Dockerfile multi-stage:

1. **Etapa de build**: Node 20 Alpine ejecuta `npm run build` para generar los assets estaticos.
2. **Etapa de servicio**: Nginx Alpine sirve los archivos estaticos y proxea las rutas de API.

La configuracion de Nginx (`nginx.conf`) proxea:
- `/api/coordinator/` hacia el servicio `coordinator` de Docker
- `/api/pool/` hacia el servicio `pool` de Docker

Esto permite que el frontend funcione como punto de entrada unico, resolviendo tanto los assets estaticos como las llamadas a la API a traves del mismo origen.
