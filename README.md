# SeatPing

Virtual Queue and Reservations Software for Restaurants and Service Businesses.

SeatPing helps businesses manage customer flow through QR code based queues, customer notifications, reservation management, and a business dashboard built for daily front-of-house operations.

---

## Overview

SeatPing is a full-stack web application designed for restaurants, cafes, salons, barbershops, clinics, and other service businesses that need a simple way to manage waiting customers and bookings.

Customers can:

- Join a queue through a QR code or public restaurant page
- Choose a notification method such as SMS, WhatsApp, or email
- Receive updates when they are admitted or ready to return
- Confirm arrival after being admitted
- Book reservations when enabled by the business

Businesses can:

- Manage live queues
- Admit, remove, and mark customers as arrived or no-show
- Manage reservations
- Track recently left customers
- Manage multiple locations
- Configure opening hours and reservation settings
- Track customer credits and usage by location
- Edit public restaurant profiles, photos, menu, reviews, and location details

The goal is to make customer flow management simple, affordable, and accessible for small and medium-sized businesses.

---

## Problem

Many service businesses still rely on manual and fragmented systems:

- Paper waitlists
- Verbal queue systems
- Crowded waiting areas
- Manual customer notifications
- Disconnected reservation and queue workflows
- Limited visibility into wait times, no-shows, and customer flow

This creates:

- Poor customer experience
- Staff inefficiency
- Confusion at the host stand
- Missed revenue from walkaways
- Limited operational data for business owners

SeatPing modernizes the waiting and booking experience with a lightweight digital workflow.

---

## Core Features

### Virtual Queue System

- QR code queue entry
- Customer-facing queue page
- Live queue updates
- Position tracking
- Estimated wait time display
- Arrival confirmation flow
- Recently left, removed, and no-show customer tracking

### Customer Notifications

- SMS notifications
- WhatsApp notifications
- Email notifications
- Queue joined messages
- Admission and arrival messages
- Ready-to-return updates

### Reservations

- Optional reservation system per business location
- Reservation availability by opening hours
- Maximum party size configuration
- Maximum reserved guests per hour
- Reservation management dashboard
- Today, upcoming, past, cancelled, and no-show tabs

### Business Dashboard

- Live queue management
- Reservation management
- Daily performance summary
- Customers served tracking
- Average wait time tracking
- No-show tracking
- Multi-location support
- Location-specific customer credits

### Public Restaurant Pages

- Restaurant profile page
- Banner and photo gallery
- Menu highlights
- Full menu link
- Reviews and business replies
- Location details
- Queue and reservation actions

### Business Settings

- Multiple business locations
- Location display name
- Address and map links
- Opening hours
- Timezone selection
- Reservation settings
- Public profile editing
- QR code per location

### Admin Features

- Business management
- Customer management
- Featured restaurant management
- Manual business activation and access control

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router

### Backend

- Node.js
- Express.js
- Prisma ORM
- MongoDB

### Authentication and Security

- JWT authentication
- bcrypt password hashing
- Protected customer, business, and admin routes

### Services

- SMS notification provider
- WhatsApp notification provider
- Email utilities
- Google Maps and Places integration
- Image upload service
