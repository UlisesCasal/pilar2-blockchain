# Delta for Node Pool Isolation

## ADDED Requirements

### Requirement: Service Isolation
The system MUST isolate infrastructure services from application services.
The system MUST apply taints to infrastructure nodes and tolerations to application pods.

#### Scenario: Verify Pod Placement
- GIVEN Infrastructure nodes with taint `role=infra:NoSchedule`
- WHEN Application pods are deployed
- THEN Application pods MUST NOT be scheduled on infrastructure nodes.

#### Scenario: Verify Infra Placement
- GIVEN Infrastructure nodes
- WHEN Infrastructure pods are deployed
- THEN Infrastructure pods MUST be scheduled on infrastructure nodes using tolerations.
