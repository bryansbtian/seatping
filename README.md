# SeatPing

Virtual Queue Management SaaS for Restaurants & Service Businesses.

SeatPing helps businesses manage customer wait times through QR-code based virtual queues and SMS notifications, reducing crowded waiting areas and improving customer experience.

---

## Overview

SeatPing is a full-stack queue management platform designed for restaurants, cafes, salons, barbershops, clinics, and other service businesses.

Customers can:

- Join a queue through a QR code
- Receive SMS updates
- Return when their turn is approaching

Businesses can:

- Manage live queues
- Admit or remove customers
- Monitor wait activity
- Manage multiple locations
- Track customer and SMS credits

The goal is to make queue management simple, affordable, and accessible for small and medium-sized businesses.

---

## Problem

Many businesses still rely on:

- Paper waitlists
- Verbal queue systems
- Crowded waiting areas
- Manual customer notifications

This creates:

- Poor customer experience
- Staff inefficiency
- Lost revenue from walkaways

SeatPing modernizes the waiting experience with a lightweight digital workflow.

---

## Core Features

### Virtual Queue System

- QR-code queue entry
- Customer-facing queue page
- Live queue updates

### SMS Notifications

- Queue status updates
- Ready-to-return notifications
- Reminder messaging

### Business Dashboard

- Queue management interface
- Customer admissions/removals
- Multi-location support

### Subscription & Billing

- Free trial system
- Credit-based plans
- Stripe payment integration

### Authentication & Security

- JWT authentication
- Password hashing with bcrypt
- Protected business/admin routes

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui

### Backend

- Node.js
- Express.js
- Prisma ORM
- MongoDB

### Infrastructure & Services

- Stripe
- SMS integration
- JWT Authentication

---

## System Architecture

```text
Customer
   ↓
QR Code / Queue Link
   ↓
React Frontend
   ↓
Express API Server
   ↓
MongoDB Database
   ↓
SMS Notification Service
```
