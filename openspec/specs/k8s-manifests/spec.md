# K8s Manifests Specification

## Requirements

### Requirement: Service Deployment
The system MUST be packaged using Helm Charts.
Each service MUST have defined healthchecks in its manifest.

#### Scenario: Deploy Services
- GIVEN Helm charts
- WHEN `helm install` is executed
- THEN all microservices are deployed and healthy.
