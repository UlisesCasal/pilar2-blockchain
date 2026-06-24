# Delta for External GPU Workers

## ADDED Requirements

### Requirement: External GPU Execution
The system MUST support external worker VMs with GPU acceleration.
The system MUST allow external workers to communicate with RabbitMQ.

#### Scenario: Worker Connectivity
- GIVEN External VM with GPU
- WHEN worker script is executed
- THEN worker MUST connect to RabbitMQ broker on the clúster's external IP/Service.
