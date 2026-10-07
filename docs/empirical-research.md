# Empirical Cloud Research & Latency Benchmarks

To ground the architectural decisions of **AgroConnect Ghana** in empirical data, the team conducted two major investigations prior to infrastructure provisioning:
1. **Empirical Network Latency Investigation:** Direct latency measurements from Ghana to cloud endpoints globally across AWS, Microsoft Azure, and Google Cloud Platform (GCP).
2. **Cloud Provider Comparative Analysis:** Systematic feature, region, pricing, and free-tier evaluation across the top three cloud providers.

---

## 1. Network Latency Investigation

### Testing Methodology
* **Origin:** Client running on broadband/cellular networks in Ghana (West Africa).
* **Metrics Captured:**
  * **TCP Connect Time (`tcp_median_ms`, `tcp_min_ms`):** Time required to complete the initial SYN/ACK 3-way TCP handshake.
  * **Request Round-Trip Time (`request_median_ms`, `request_min_ms`):** Full application-layer HTTP round-trip latency to receive response headers.
* **Target Services:** Cloud health/ping endpoints across global data centers.

### Shortlisted Regional Results

The table below summarizes median and minimum response times across the top shortlisted regions:

| Provider | Region Identifier | Geographic Location | TCP Median (ms) | TCP Min (ms) | Request Median (ms) | Request Min (ms) |
|---|---|---|---|---|---|---|
| **AWS** | **`af-south-1`** | **Cape Town, South Africa** | **133** | **79** | **74** | **73** |
| AWS | `eu-south-2` | Madrid, Spain | 120 | 117 | 112 | 111 |
| AWS | `eu-west-2` | London, UK | 125 | 116 | 117 | 109 |
| AWS | `eu-west-3` | Paris, France | 136 | 121 | 128 | 125 |
| AWS | `eu-west-1` | Dublin, Ireland | 138 | 130 | 134 | 124 |
| AWS | `us-east-1` | North Virginia, USA | 255 | 173 | 175 | 169 |
| Azure | `uksouth` | London, UK | 117 | 116 | 116 | 114 |
| Azure | `westeurope` | Netherlands | 124 | 123 | 122 | 121 |
| Azure | `southafricanorth` | Johannesburg, South Africa | 103 | 99 | 129 | 100 |
| Azure | `spaincentral` | Madrid, Spain | 173 | 135 | 136 | 134 |
| Azure | `francecentral` | Paris, France | 157 | 122 | 183 | 119 |
| Azure | `eastus` | Virginia, USA | 251 | 191 | 192 | 187 |
| GCP | `europe-west9` | Paris, France | 118 | 113 | 127 | 120 |
| GCP | `europe-west1` | Belgium | 120 | 111 | 134 | 123 |

### Analysis & Key Takeaways

```
Latency Comparison (Request Median RTT in ms)
─────────────────────────────────────────────────────────────
AWS af-south-1 (Cape Town)  █████████████ 74 ms   <-- FASTEST
AWS eu-south-2 (Spain)      ███████████████████ 112 ms
Azure uksouth (London)      ████████████████████ 116 ms
AWS eu-west-2 (London)      ████████████████████ 117 ms
GCP europe-west9 (Paris)    █████████████████████ 127 ms
Azure southafricanorth (SA) █████████████████████ 129 ms
AWS us-east-1 (N. Virginia) █████████████████████████████ 175 ms
Azure eastus (Virginia)     ████████████████████████████████ 192 ms
─────────────────────────────────────────────────────────────
```

1. **Superior Application RTT in Cape Town:** AWS `af-south-1` demonstrated the lowest application RTT (**74 ms**), making it 36% faster than European options and ~60% faster than US East Coast endpoints.
2. **Submarine Cable Routing Reality:** Although physical geographic distance to Europe is slightly shorter along some fiber corridors, AWS backbone routing to Cape Town yields superior round-trip performance for HTTPS request/response cycles originating from Ghanaian ISPs.
3. **The Danger of US-Default Regions:** Defaulting to `us-east-1` (a common mistake in cloud projects) introduces an unavoidable ~175 ms penalty per request, which severely degrades mobile user experience during bulk offline queue flushes.

---

## 2. Cloud Providers Comparative Matrix

A detailed evaluation was conducted comparing AWS, Microsoft Azure, and Google Cloud Platform across core architectural capabilities:

| Category | Amazon Web Services (AWS) | Microsoft Azure | Google Cloud Platform (GCP) |
|---|---|---|---|
| **Compute Service** | **Amazon EC2** (Elastic Compute Cloud). Instances launched via AMIs, Launch Templates, and Auto Scaling Groups. | **Azure Virtual Machines** (VMs). Deployed in Virtual Machine Scale Sets (VMSS). | **Compute Engine**. VM instances deployed in Managed Instance Groups (MIGs). |
| **Object Storage Service** | **Amazon S3** (Simple Storage Service). Flat object hierarchy, global namespace, storage classes, lifecycle rules. | **Azure Blob Storage**. Blobs organized in containers with Hot, Cool, and Archive tiers. | **Cloud Storage**. Buckets with Standard, Nearline, Coldline, and Archive classes. |
| **Nearest Region to West Africa** | **`af-south-1`** (Cape Town, 3 AZs: `af-south-1a`, `-b`, `-c`). | **`southafricanorth`** (Johannesburg) and **`southafricawest`** (Cape Town). | **`africa-south1`** (Johannesburg; zones `-a`, `-b`, `-c`). |
| **Free-Tier Model** | Credit-based & service allowances. New accounts receive promotional credits + 12-month free allowances + Always Free tier. | Two layers: $200 initial 30-day credit, followed by 12 months of popular free services + Always Free. | Two layers: $300 Welcome credit for 90 days + permanent Always Free tier (e2-micro). |
| **Free-Tier Limits & Expirations** | Free tier covers 750 hrs/month of single `t2.micro`/`t3.micro` instance + 5 GB S3 storage. | 12 months: 750 hrs/mo B1S VM, 5 GB Blob storage. | Always Free: 1 `e2-micro` VM per month in US regions, 5 GB Cloud Storage. |
| **Primary Pitfall / Trap** | Free plan accounts without explicit billing controls can accidentally leave unattached EBS volumes, NAT gateways, or Elastic IPs accruing charges. | App Service (F1) and SQL Database free tiers have cold-start timeouts and aggressive quota throttles. | The Always Free `e2-micro` and free Cloud Storage are strictly confined to US regions (`us-central1`, `us-east1`, `us-west1`), invalidating low-latency African deployment. |
| **Organizational Unit Hierarchy** | **Account** (inside AWS Organization / Organizational Unit [OU]). | **Tenant &rarr; Management Group &rarr; Subscription &rarr; Resource Group**. | **Organization &rarr; Folder &rarr; Project &rarr; Resource**. |
| **Infrastructure as Code (IaC) Support** | Premier Terraform AWS Provider (`hashicorp/aws`) with immediate day-zero resource support. | AzureRM Terraform provider with feature-rich ARM template parity. | Google Terraform Provider with Google Cloud Config Connector. |

---

## 3. Final Synthesis & Selection Rationale

Based on the combined results of both studies:

1. **GCP Disqualified for Latency/Free-Tier Contradiction:** While GCP offers an Always Free `e2-micro`, it is strictly restricted to US regions. Running in GCP's Johannesburg region (`africa-south1`) incurs full commercial rates without free-tier coverage.
2. **Azure Disqualified for Latency Overhead:** Azure's Johannesburg region yielded an unexpected **129 ms median RTT** in our tests, and its European alternatives (e.g., `francecentral` at 183 ms) were significantly slower.
3. **AWS Selected as Optimal Choice:** AWS `af-south-1` provided the lowest latency (**74 ms**), superior developer tooling, and allowed our team to design a customized, cost-effective VPC topology using Terraform and `fck-nat`.

---

## Related References
* [Spreadsheet Dataset: `Cloud Platform Regions Latency Investigation.xlsx`](file:///Users/josetseph/Library/CloudStorage/GoogleDrive-joseph.etse@ashesi.edu.gh/My%20Drive/CC%20Group%203%20Highlanders/Prosits/1/labs/Cloud%20Platform%20Regions%20Latency%20Investigation.xlsx)
* [Comparison Sheet: `Cloud Providers Comparison Table.xlsx`](file:///Users/josetseph/Library/CloudStorage/GoogleDrive-joseph.etse@ashesi.edu.gh/My%20Drive/CC%20Group%203%20Highlanders/Prosits/1/labs/Cloud%20Providers%20Comparison%20Table.xlsx)
* [Architectural Decision Record ADR-001](./architecture-decisions.md#adr-001-cloud-provider--target-region-selection)
* [Cloud Infrastructure Specification](./cloud-infrastructure.md)
