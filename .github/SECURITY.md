# Security Policy

## Reporting a Vulnerability

If you believe you have found a security vulnerability in SeatPing, please report it
privately. Do not open a public issue, pull request, or discussion, since that could expose
users of the platform before a fix is available.

Preferred channel: GitHub private vulnerability reporting. Open the **Security** tab of this
repository and choose **Report a vulnerability**. That channel is private to the maintainers.

If private reporting is unavailable to you, email help@seatping.biz instead.

Please include:

- A description of the issue and the potential impact.
- Steps to reproduce, or a proof of concept.
- The affected area (API route, page, background job, dependency) if known.
- Any relevant logs, requests, or screenshots, with secrets and personal data redacted.

## What to Expect

- We aim to acknowledge your report within 3 business days.
- We will investigate, keep you updated on progress, and let you know when a fix ships.
- Please give us a reasonable amount of time to address the issue before any public
  disclosure.

## Supported Versions

SeatPing is a continuously deployed hosted application. Only the `main` branch receives
security fixes, and it is what runs in production. There are no supported published releases.

## Scope

In scope:

- The SeatPing web application, both the React frontend and the Express API.
- Authentication, authorization, and session handling, including the separate customer,
  business, and admin httpOnly cookie sessions.
- Data exposure of customer, business, or admin information, including anything that leaks
  names, contact details, or message content into analytics, logs, or responses.
- Credential handling: anything that causes an API key, token, or other secret to reach
  logs, error messages, stored files, or stdout.
- Background jobs and cron endpoints, including QStash signature verification and the credit,
  slot counter, and queue transition guards.
- Dependency issues with a demonstrated, exploitable impact on this project.

Out of scope:

- Reports from automated scanners without a demonstrated, exploitable impact.
- Vulnerabilities in third-party services or SDKs we integrate with (Telnyx, Kapso, Upstash,
  Vercel, MongoDB Atlas), unless our use of them is what creates the vulnerability.
- Denial of service, volumetric, or rate-limit testing against production.

## Handling Secrets

Never include real secrets, API keys, tokens, or production credentials in a report. If you
discover an exposed secret, tell us what was exposed and where, but do not paste the value.

The same rule governs this repository: `.env` is git-ignored, `.env.example` holds
placeholders only, and any file committed by a tool in this project must be reviewed for
credentials and personal data before it lands.
