```mermaid
architecture-beta
  group aws(cloud)[AWS Cloud]
  group vpc(cloud)[VPC] in aws
  group public_subnet(cloud)[Public Subnet] in vpc
  group private_subnet(cloud)[Private Subnet] in vpc

  service internet(internet)[Users and Browsers]
  service cdn(server)[CloudFront CDN] in aws
  service spa_bucket(disk)[S3 Frontend SPA] in public_subnet
  service alb(server)[ALB] in public_subnet

  group api_group(server)[FastAPI Services] in private_subnet
  service auth(server)[Auth Router] in api_group
  service catalog(server)[Catalog Router] in api_group
  service health(server)[Health Router] in api_group

  service rds(database)[Postgres RDS] in private_subnet

  internet --> cdn
  cdn --> spa_bucket
  cdn --> alb

  alb --> auth
  alb --> catalog
  alb --> health

  auth --> rds
  catalog --> rds
  health --> rds

```
