# Auth Support Specification

## Requirements

### Requirement: Ingress Auth
The Ingress MUST route authentication routes to the coordinator.

#### Scenario: Access with Auth
- GIVEN User login
- WHEN user accesses protected route
- THEN ingress routes to auth middleware.
