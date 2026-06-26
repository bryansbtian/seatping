# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in SeatPing, please report it privately. Do not open a public issue, pull request, or discussion, since that could expose other users before a fix is available.

Email: security@seatping.biz

Please include:

- A description of the issue and the potential impact.
- Steps to reproduce, or a proof of concept.
- The affected area (API route, page, dependency, etc.) if known.
- Any relevant logs, requests, or screenshots (redact secrets and personal data).

## What to Expect

- We aim to acknowledge your report within 3 business days.
- We will investigate, keep you updated on progress, and let you know when a fix is released.
- Please give us a reasonable amount of time to address the issue before any public disclosure.

## Scope

In scope:

- The SeatPing web application (frontend and API).
- Authentication, authorization, and session handling.
- Data exposure of customer, business, or admin information.

Out of scope:

- Reports from automated scanners without a demonstrated, exploitable impact.
- Denial of service, volumetric, or rate-limit testing against production.
- Issues in third-party services we integrate with (report those to the relevant vendor).

## Handling Secrets

Never include real secrets, API keys, tokens, or production credentials in a report. If you discover an exposed secret, tell us what was exposed and where, but do not paste the value.
