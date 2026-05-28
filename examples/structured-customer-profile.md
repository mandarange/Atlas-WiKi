# Structured Customer Profile Example

Use this input with the `customer_profile` schema from the README:

```text
Name: Acme Corp
Tier: Enterprise
Owner: Maya Chen
Renewal Date: 2026-09-30
```

The built-in key-value extractor maps the fields to `name`, `tier`, `owner`, and `renewal_date`. The README registers `name` and `tier` as required fields and `name` as the identity field, so this sample is executable as a proposal-mode structured extraction.

Run the TypeScript example from this package checkout, or copy `examples/structured-customer-profile.ts` into a consumer project that has Atlas WiKi installed:

```bash
npx tsx examples/structured-customer-profile.ts
```
