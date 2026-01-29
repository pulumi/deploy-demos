"""Network stack - VPC and subnets for EKS cluster."""

import pulumi
import pulumi_awsx as awsx

# Get configuration
config = pulumi.Config()
vpc_network_cidr = config.get("vpcNetworkCidr") or "10.0.0.0/16"

# Create a VPC for the EKS cluster
eks_vpc = awsx.ec2.Vpc(
    "eks-vpc",
    enable_dns_hostnames=True,
    cidr_block=vpc_network_cidr,
)

# Export values for the app stack to consume via stack references
pulumi.export("vpcId", eks_vpc.vpc_id)
pulumi.export("publicSubnetIds", eks_vpc.public_subnet_ids)
pulumi.export("privateSubnetIds", eks_vpc.private_subnet_ids)
