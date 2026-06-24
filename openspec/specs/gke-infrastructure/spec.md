# GKE Infrastructure Specification

## Requirements

### Requirement: Cluster Provisioning
The system MUST be provisioned using OpenTofu (OT) on GKE.
The system MUST have 3 nodegroups (infrastructure, app, processing).

#### Scenario: Provision Cluster
- GIVEN OpenTofu configuration
- WHEN `tofu apply` is executed
- THEN GKE cluster is provisioned with 3 nodegroups.
