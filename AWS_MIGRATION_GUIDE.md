# AWS Migration Guide

This guide provides step-by-step instructions for manually completing the AWS migration that cannot be automated.

## Overview

The code changes for S3 storage support and Docker containerization are complete. The remaining steps require manual actions in AWS Console and domain registrar.

## Prerequisites

- AWS account
- Access to domain registrar for cmogle.com
- AWS CLI (optional, for automation)
- Domain access credentials

## Phase 1: Domain Recovery

### Step 1.1: Access Domain Registrar

1. Identify where cmogle.com is registered
2. Log into registrar account
3. Enable 2FA if not already enabled
4. Change password if account was compromised
5. Verify contact email addresses

### Step 1.2: Clean DNS Records

Current status:
- Domain points to: 160.124.73.164
- Nameservers: a.share-dns.com, b.share-dns.net (Cloudflare)

Actions:
1. Access DNS management in registrar or Cloudflare
2. Remove/update A record pointing to compromised WordPress
3. Review and remove suspicious CNAME, MX, TXT records
4. Document current configuration

## Phase 2: AWS Infrastructure Setup

### Step 2.1: AWS Account Setup

1. Create/verify AWS account
2. Set up billing alerts (Settings → Billing → Preferences)
3. Create IAM user for infrastructure (avoid using root account)
   - User with programmatic access
   - Attach policies: AmazonECS_FullAccess, AmazonRoute53FullAccess, etc.

### Step 2.2: Route 53 Hosted Zone

1. Go to Route 53 → Hosted zones
2. Click "Create hosted zone"
3. Domain name: `cmogle.com`
4. Type: Public hosted zone
5. Copy the 4 nameservers (NS records)
6. In domain registrar, update nameservers to Route 53 nameservers
7. Wait 24-48 hours for propagation

### Step 2.3: SSL Certificate (ACM)

1. Go to Certificate Manager (us-east-1 region)
2. Request certificate
3. Domain names:
   - `cmogle.com`
   - `*.cmogle.com` (wildcard)
4. Validation: DNS validation
5. Add DNS validation records to Route 53 (ACM provides instructions)
6. Wait for validation (usually 30 minutes to a few hours)

### Step 2.4: S3 Bucket Setup

1. Go to S3 → Create bucket
2. Bucket name: `graafin-data-cmogle-com` (must be globally unique)
3. Region: Choose your preferred region (e.g., us-east-1)
4. Block Public Access: Keep enabled
5. Versioning: Enable (optional, for backup)
6. Create IAM policy for bucket access (see below)

**IAM Policy for S3 Access:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::graafin-data-cmogle-com/*"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::graafin-data-cmogle-com"
    }
  ]
}
```

## Phase 3: ECS Infrastructure

### Step 3.1: Create VPC and Networking (if needed)

1. Go to VPC → Your VPCs
2. Use default VPC or create new VPC
3. Ensure you have at least 2 public subnets in different AZs
4. Ensure internet gateway is attached

### Step 3.2: ECS Cluster

1. Go to ECS → Clusters
2. Click "Create Cluster"
3. Cluster name: `graafin-cluster`
4. Infrastructure: AWS Fargate (serverless)
5. Create cluster

### Step 3.3: Application Load Balancer

1. Go to EC2 → Load Balancers → Create Load Balancer
2. Type: Application Load Balancer
3. Name: `graafin-alb`
4. Scheme: Internet-facing
5. IP address type: IPv4
6. VPC: Select your VPC
7. Subnets: Select at least 2 public subnets
8. Security group: Create new (allow HTTP 80, HTTPS 443 from 0.0.0.0/0)
9. Listeners:
   - HTTP:80 → Redirect to HTTPS:443
   - HTTPS:443 → Select ACM certificate
10. Create target group (see next step)

### Step 3.4: Target Group

1. Go to EC2 → Target Groups → Create target group
2. Target type: IP addresses
3. Target group name: `graafin-tg`
4. Protocol: HTTP, Port: 3000
5. VPC: Select your VPC
6. Health checks:
   - Path: `/api/health`
   - Healthy threshold: 2
   - Unhealthy threshold: 3
   - Timeout: 5 seconds
   - Interval: 30 seconds

### Step 3.5: ECR (Container Registry)

1. Go to ECR → Repositories → Create repository
2. Repository name: `graafin`
3. Visibility: Private
4. Create repository
5. View push commands (you'll use these to push Docker image)

### Step 3.6: Build and Push Docker Image

```bash
# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t graafin .

# Tag image
docker tag graafin:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/graafin:latest

# Push image
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/graafin:latest
```

### Step 3.7: ECS Task Definition

1. Go to ECS → Task Definitions → Create new Task Definition
2. Family: `graafin`
3. Launch type: Fargate
4. Task size:
   - CPU: 0.25 vCPU (256)
   - Memory: 0.5 GB (512)
5. Task role: Create IAM role with S3 access policy (from Step 2.4)
6. Container:
   - Name: `graafin`
   - Image: `<account-id>.dkr.ecr.us-east-1.amazonaws.com/graafin:latest`
   - Port mappings: 3000 (TCP)
   - Environment variables (or use Secrets Manager):
     - `NODE_ENV=production`
     - `PORT=3000`
     - `STORAGE_MODE=s3`
     - `S3_BUCKET_NAME=graafin-data-cmogle-com`
     - `AWS_REGION=us-east-1`
     - `TWILIO_ACCOUNT_SID` (from Secrets Manager)
     - `TWILIO_AUTH_TOKEN` (from Secrets Manager)
     - `TWILIO_WHATSAPP_FROM` (from Secrets Manager)
     - `NOTIFY_WHATSAPP` (from Secrets Manager)
     - `MONITOR_SECRET` (from Secrets Manager)
7. Logging: CloudWatch Logs
8. Create task definition

### Step 3.8: ECS Service

1. Go to ECS → Clusters → graafin-cluster → Services tab
2. Create Service
3. Launch type: Fargate
4. Task definition: graafin (latest revision)
5. Service name: `graafin-service`
6. Desired tasks: 1 (or 2 for redundancy)
7. VPC: Select your VPC
8. Subnets: Select public subnets
9. Security group: Create/select security group (allow inbound 3000 from ALB security group)
10. Load balancing: Application Load Balancer
    - Load balancer: graafin-alb
    - Target group: graafin-tg
    - Container to load balance: graafin:3000
11. Create service

### Step 3.9: Route 53 DNS Record

1. Go to Route 53 → Hosted zones → cmogle.com
2. Create record
3. Record name: `graafin`
4. Record type: A
5. Alias: Yes
6. Alias to: Application and Classic Load Balancer
7. Region: Your region
8. Load balancer: graafin-alb
9. Create record

## Phase 4: EventBridge (Cron Jobs)

### Step 4.1: Create EventBridge Rules

1. Go to EventBridge → Rules → Create rule
2. Name: `graafin-monitor-cron`
3. Event pattern: Schedule
4. Schedule pattern: Rate expression: `rate(5 minutes)`
5. Target: HTTP endpoint
   - Endpoint URL: `https://graafin.cmogle.com/api/monitor`
   - HTTP method: POST
   - Headers:
     - `x-monitor-key`: `<MONITOR_SECRET>`
     - `Content-Type`: `application/json`
6. Create rule

Repeat for heartbeat:
1. Name: `graafin-heartbeat-cron`
2. Schedule: `rate(1 hour)` or cron: `cron(0 * * * ? *)`
3. Target: HTTP endpoint
   - Endpoint URL: `https://graafin.cmogle.com/api/heartbeat`
   - Same headers as above

## Phase 5: Secrets Management

### Step 5.1: AWS Secrets Manager

1. Go to Secrets Manager → Store a new secret
2. Secret type: Other type of secret
3. Key/value pairs:
   - `TWILIO_ACCOUNT_SID`: `<your-value>`
   - `TWILIO_AUTH_TOKEN`: `<your-value>`
   - `TWILIO_WHATSAPP_FROM`: `<your-value>`
   - `NOTIFY_WHATSAPP`: `<your-value>`
   - `MONITOR_SECRET`: `<generate-random-string>`
4. Secret name: `graafin/secrets`
5. Store secret

### Step 5.2: Update ECS Task Definition

Update task definition to reference secrets:
- Remove environment variables for secrets
- Add secrets section referencing Secrets Manager

## Phase 6: Data Migration

### Step 6.1: Upload Existing Data to S3

```bash
# Download data from Render (if accessible)
# Then upload to S3:

aws s3 cp results.json s3://graafin-data-cmogle-com/results.json
aws s3 cp results-plus500.json s3://graafin-data-cmogle-com/results-plus500.json
aws s3 cp state.json s3://graafin-data-cmogle-com/state.json
```

## Phase 7: Testing and Verification

1. Test health endpoint: `https://graafin.cmogle.com/api/health`
2. Verify application is accessible
3. Check CloudWatch logs for errors
4. Test EventBridge rules are firing
5. Verify WhatsApp notifications work
6. Test search functionality

## Phase 8: Cleanup

1. Keep Render service running for 48 hours as backup
2. Verify AWS setup is stable
3. Decommission Render services
4. Update any external references

## Environment Variables Summary

Required environment variables for ECS task:

```bash
NODE_ENV=production
PORT=3000
STORAGE_MODE=s3
S3_BUCKET_NAME=graafin-data-cmogle-com
AWS_REGION=us-east-1
# Secrets from Secrets Manager:
# TWILIO_ACCOUNT_SID
# TWILIO_AUTH_TOKEN
# TWILIO_WHATSAPP_FROM
# NOTIFY_WHATSAPP
# MONITOR_SECRET
```

## Cost Monitoring

- Set up AWS Cost Explorer
- Configure billing alerts
- Monitor ECS, ALB, S3, and data transfer costs
- Estimated monthly cost: $32-42/month (see plan for details)
