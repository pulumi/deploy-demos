# EKS Split Stacks Demo

This demo shows how to split a Pulumi infrastructure project into multiple stacks using stack references.

## Architecture

The infrastructure is split into two stacks:

1. **Network Stack** (`network-stack/`): Contains the VPC and subnet infrastructure
   - VPC with public and private subnets across 3 availability zones
   - Internet Gateway, NAT Gateways, and route tables
   - Exports: `vpcId`, `publicSubnetIds`, `privateSubnetIds`

2. **App Stack** (`app-stack/`): Contains the EKS cluster and Kubernetes workloads
   - References the network stack to get VPC information
   - EKS cluster with managed node group
   - Sample nginx deployment with LoadBalancer service
   - Exports: `kubeconfig`, `clusterName`, `url`

## Benefits of Stack Splitting

- **Separation of concerns**: Network team can manage VPC independently
- **Faster deployments**: Changes to app stack don't require VPC changes
- **Reduced blast radius**: Network changes don't affect running workloads
- **Reusability**: Multiple app stacks can share the same network stack

## Deployment Order

1. Deploy the network stack first:
   ```bash
   cd network-stack
   pulumi up
   ```

2. Then deploy the app stack:
   ```bash
   cd app-stack
   pulumi up
   ```

## Configuration

### Network Stack
- `vpcNetworkCidr`: CIDR block for the VPC (default: `10.0.0.0/16`)

### App Stack
- `networkStackName`: Full name of the network stack (e.g., `team-ce/eks-network-stack/dev`)
- `minClusterSize`: Minimum number of nodes (default: 3)
- `maxClusterSize`: Maximum number of nodes (default: 6)
- `desiredClusterSize`: Desired number of nodes (default: 3)
- `eksNodeInstanceType`: EC2 instance type for nodes (default: `t3.medium`)

## Cleanup

Destroy in reverse order:
```bash
cd app-stack
pulumi destroy

cd ../network-stack
pulumi destroy
```
