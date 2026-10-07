# Engineering Learnings — AgroConnect Ghana

A living journal of discoveries made during PROSIT 1 implementation. Each entry
captures something the team didn't know (or had wrong) before we hit it in
practice, and the mental model we walked away with. Written for later
reflection in the lab report and the course viva.

Format for each entry:
- **Context**: what we were trying to do
- **What we expected / assumed**: our mental model going in
- **What actually happened**: the signal that corrected us
- **The real mechanism**: what's actually going on under the hood
- **Takeaway**: the generalizable rule we now carry forward

---

## L-001 — AWS Amplify Hosting + Terraform + GitHub App: a public-API gap

### Context
We chose AWS Amplify Hosting to deploy the Vite+React PWA (see
[ADR-009](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)).
Our team's GitOps workflow is Terraform-first — every resource ideally
reproducible from a `terraform apply`. We expected Amplify to be no different.

### What we expected
Terraform's `aws_amplify_app` resource would be a straightforward wrapper over
AWS's `CreateApp` API. We'd supply the GitHub repo URL plus some auth, and the
resource would create everything end-to-end.

### What actually happened
Three distinct failures, each revealing a layer of the problem:

1. **Attempt 1 — AWS Managed NAT alternative region**: `terraform apply` failed
   with a DNS resolution error (`no such host: amplify.af-south-1.amazonaws.com`).
   Amplify Hosting is **not offered in `af-south-1`**. Learned: not every AWS
   service is in every region; the AWS Regional Services list is the source of
   truth, not assumption.

2. **Attempt 2 — PAT-based auth in `eu-west-1`**: After moving to Ireland and
   setting up a GitHub classic Personal Access Token in Secrets Manager,
   `terraform apply` failed with:
   > `Deploy keys are disabled for this repository`

   The ASU-MICS-2028 org blocks deploy keys. The PAT auth path in Amplify
   creates a GitHub deploy key under the hood, which the org rejects.

3. **Attempt 3 — GitHub App auth**: We installed the AWS Amplify GitHub App
   on the org (scoped to this repo only) and removed `access_token` from the
   Terraform resource. `terraform apply` failed with:
   > `You should at least provide one valid token`

   The public `CreateApp` API **requires** `accessToken` or `oauthToken`. There
   is no API field for "use the installed GitHub App." The Amplify Console UI
   can create apps via GitHub App because it uses a **private internal API**
   AWS has never exposed to CloudFormation, Terraform, or the CLI.

### The real mechanism

AWS has two parallel APIs for Amplify, and they are not reconciled:

| Path | Who uses it | Supports GitHub App? |
|---|---|---|
| Public `CreateApp` / `UpdateApp` | Terraform, CloudFormation, AWS CLI, Boto3 | **No** — only token-based |
| Private console-only endpoints | AWS Amplify Console UI | **Yes** — hidden behind "Connect to GitHub" button |

Once an app exists (however created), `UpdateApp` works fine with any
authentication because the GitHub connection is stored as internal Amplify
state — the public API only sees attributes, not auth. So the pragmatic
workaround is:

1. Create the app **once** in the AWS Console (uses the GitHub App via the
   private API).
2. `terraform import module.frontend.aws_amplify_app.pwa <app-id>` brings it
   into Terraform state.
3. Every subsequent `terraform apply` manages attributes freely.

This gap has been tracked as an open HashiCorp provider issue since 2021;
AWS has acknowledged it but has not shipped a fix.

### Takeaway

**"Infrastructure as Code" has edges.** A platform can claim first-class
Terraform support and still gate certain operations behind console-only
APIs. The honest engineering response is not to abandon IaC — it's to
document the irreducible manual step as part of the setup, so recovery from
a destroyed environment is still a known, finite sequence of actions.

In our case: the one-time "install GitHub App + create app in console" is
written into [ADR-009](./architecture-decisions.md#adr-009-frontend-hosting-on-aws-amplify-in-eu-west-1)
with the exact click paths. The next engineer who rebuilds this environment
knows exactly what to do.

**Broader principle**: when a vendor's primary interface is a console UI,
assume there are features the public API doesn't fully expose. Verify
reproducibility by trying to recreate from scratch, not by trusting the
`terraform apply` to be the full story.

---

## L-002 — CloudFront routes by `Host` header, not by DNS target

### Context
After `terraform apply` provisioned the Amplify custom domain for
`app.agroconnect.space`, we added two CNAME records at Hostinger:

- `app.agroconnect.space` → `dh69czdi2soni.cloudfront.net`
- `_<token>.agroconnect.space` → `_<acm-token>.wzccmgtwzk.acm-validations.aws.`

A team member tested the integration by visiting
`https://dh69czdi2soni.cloudfront.net` directly in a browser. **It returned
HTTP 404.** The reasonable concern was: *is the CNAME wrong?*

### What we expected
If `app.agroconnect.space` points at `dh69czdi2soni.cloudfront.net`, then
`dh69czdi2soni.cloudfront.net` should serve the same content directly. A URL
is a URL.

### What actually happened

```
$ curl -I https://dh69czdi2soni.cloudfront.net/
HTTP/2 404
x-cache: Error from cloudfront

$ curl -I https://app.agroconnect.space/
HTTP/2 200
content-type: text/html
```

Same TCP endpoint. Different response. The only difference between the two
requests is the HTTP `Host` header.

### The real mechanism

CloudFront distributions are configured with a list of **"alternate domain
names"** (CNAMEs). The Amplify distribution's list contains:

- `app.agroconnect.space`
- `main.d2g707z7kcvd4a.amplifyapp.com`

The raw CloudFront hostname (`dh69czdi2soni.cloudfront.net`) is **not** in
that list. When a request arrives, CloudFront:

1. Reads the HTTP `Host` header
2. Looks for a distribution whose alternate-domain-names list contains that host
3. If no match → **HTTP 404**
4. If match → serves the content, with the TLS cert configured for that domain

The DNS CNAME chain is a layer below HTTP:

```
app.agroconnect.space       (what the browser sends as Host)
    │
    ▼ [CNAME at Hostinger]
dh69czdi2soni.cloudfront.net   (a DNS pointer — not a web address)
    │
    ▼ [A record at AWS]
<CloudFront edge IP>
    │
    ▼ [TCP connection]
CloudFront edge, HTTP request with Host: app.agroconnect.space
    │
    ▼ [distribution lookup by Host]
Correct distribution → 200 OK
```

The CloudFront hostname is a DNS routing label; it is deliberately not
meant to be a browsable URL. This is actually a security feature: it
prevents someone from attaching their own domain to your distribution.

### Takeaway

**DNS routing (CNAME) and HTTP routing (Host header) are two different
layers that happen to be chained in common deployments.** When they
disagree, the layer that gets the final word is HTTP — because that's
where CloudFront, nginx, ALBs, and every reverse proxy look to decide
what to serve.

Diagnostic rule for similar confusion in the future:

```
curl -I https://<the-cname-target>/
# → unexpected 404 or 403 → confirms Host-header-dependent routing
curl -I -H "Host: <the-custom-domain>" --resolve ... https://<custom>/
# → 200 → confirms the target is correct; only Host header matters
```

The lab-report framing: this is a case where **transport-layer plumbing
(DNS) and application-layer dispatch (HTTP) look like one system from the
outside but are two systems internally**. Separation of concerns, visible
only when something goes "wrong" in an instructive way.

---

## Future entries

New learnings go below as we hit them. Format them with the same five-section
template so later reflection is uniform. Candidate topics the team should
capture when they land:

- L-003 — `fck-nat` vs AWS Managed NAT Gateway: cost/complexity tradeoff,
  single-AZ ceiling, and what `source_dest_check = false` actually does.
- L-004 — ACM certificate region constraints (CloudFront requires `us-east-1`,
  ALB requires same region as the ALB).
- L-005 — Why `ALBRequestCountPerTarget` is a better scaling signal than
  CPU for an IO-bound API (see [ADR-008](./architecture-decisions.md#adr-008-target-tracking-auto-scaling-on-albrequestcountpertarget)).
- L-006 — PWA cache semantics: `index.html` must be `no-cache`, `sw.js` must
  be `no-store`, hashed assets `max-age=1yr`. Why this matters for Perfect's
  deploy workflow.
