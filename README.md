# SeatPing - Queue Management System

A modern queue management system for businesses to manage customer wait times and notifications.

## Project Overview

SeatPing is a full-stack application that allows businesses to:

- Create and manage virtual queues for their locations
- Send SMS notifications to customers about their queue status
- Handle customer admissions and removals
- Manage subscription plans with different credit limits
- Process payments through Stripe integration

## Project Structure

```
seat-ping/
├── 📁 public/                     # Static assets
│   ├── favicon.ico               # Site favicon
│   ├── placeholder.svg           # Default placeholder image
│   └── robots.txt                # SEO robots file
│
├── 📁 src/                       # Frontend React application
│   ├── 📁 components/            # Reusable UI components
│   │   ├── 📁 ui/               # shadcn/ui components
│   │   │   ├── button.tsx       # Button component
│   │   │   ├── card.tsx         # Card component
│   │   │   ├── dialog.tsx       # Modal dialog component
│   │   │   ├── input.tsx        # Input field component
│   │   │   └── ...              # Other UI components
│   │   ├── BusinessHeader.tsx   # Business dashboard header
│   │   ├── Footer.tsx           # Site footer
│   │   └── Header.tsx           # Main site header
│   │
│   ├── 📁 hooks/                # Custom React hooks
│   │   ├── use-mobile.tsx       # Mobile detection hook
│   │   └── use-toast.ts         # Toast notification hook
│   │
│   ├── 📁 lib/                  # Utility libraries
│   │   ├── api.ts              # API client functions
│   │   └── utils.ts            # General utility functions
│   │
│   ├── 📁 pages/                # Page components
│   │   ├── Admin.tsx           # Admin dashboard
│   │   ├── BusinessDashboard.tsx # Business owner dashboard
│   │   ├── BusinessSettings.tsx  # Business settings page
│   │   ├── Dashboard.tsx       # User dashboard
│   │   ├── Demo.tsx            # Demo page
│   │   ├── Feedback.tsx        # Feedback form
│   │   ├── Index.tsx           # Home page
│   │   ├── LandingPage.tsx     # Marketing landing page
│   │   ├── Login.tsx           # User login
│   │   ├── Payments.tsx        # Payment/pricing page
│   │   ├── PaymentSuccess.tsx  # Payment success page
│   │   ├── Queue.tsx           # Customer queue view
│   │   ├── QueueBusiness.tsx   # Business queue management
│   │   ├── Sales.tsx           # Sales page
│   │   ├── Signup.tsx          # User registration
│   │   └── ...                 # Other pages
│   │
│   ├── App.tsx                 # Main app component
│   ├── App.css                 # Global app styles
│   ├── index.css               # Global CSS imports
│   ├── main.tsx                # React app entry point
│   └── vite-env.d.ts           # Vite type definitions
│
├── 📁 server/                   # Backend Node.js/Express server
│   ├── 📁 lib/                 # Server utility libraries
│   │   ├── auth.ts             # Authentication utilities
│   │   ├── email.ts            # Email sending functionality
│   │   ├── prisma.ts           # Database connection
│   │   ├── trial.ts            # Trial management logic
│   │   └── validation.ts       # Input validation schemas
│   │
│   ├── 📁 routes/              # API route handlers
│   │   ├── admin.ts            # Admin API endpoints
│   │   ├── auth.ts             # Authentication endpoints
│   │   └── stripe.ts           # Stripe payment webhooks
│   │
│   └── index.ts                # Server entry point
│
├── 📁 prisma/                  # Database schema and migrations
│   └── schema.prisma           # Prisma database schema
│
├── 📄 Configuration Files
│   ├── components.json         # shadcn/ui configuration
│   ├── eslint.config.js        # ESLint configuration
│   ├── package.json            # Node.js dependencies
│   ├── postcss.config.js       # PostCSS configuration
│   ├── tailwind.config.ts      # Tailwind CSS configuration
│   ├── tsconfig.json           # TypeScript configuration
│   └── vite.config.ts          # Vite build configuration
│
└── 📄 Other Files
    ├── bun.lockb               # Bun package lock file
    ├── node_modules/           # Node.js dependencies
    └── README.md               # This file
```

## Key Features & Components

### 🎯 **Core Functionality**

- **Queue Management**: Virtual queue system for businesses
- **SMS Notifications**: Automated customer notifications via SMS
- **Subscription Plans**: Starter and Professional tiers with different limits
- **Payment Processing**: Stripe integration for subscription billing
- **Trial System**: 7-day free trial for new users

### 🏗️ **Architecture**

#### **Frontend (React + TypeScript)**

- **Vite**: Fast build tool and development server
- **shadcn/ui**: Modern, accessible UI component library
- **Tailwind CSS**: Utility-first CSS framework
- **React Router**: Client-side routing
- **Custom Hooks**: Reusable state management logic

#### **Backend (Node.js + Express)**

- **Express.js**: Web framework for API routes
- **Prisma**: Database ORM with MongoDB
- **Stripe**: Payment processing and webhooks
- **JWT**: Authentication token management
- **bcrypt**: Password hashing

#### **Database (MongoDB)**

- **User Management**: User accounts, plans, and trial status
- **Location Data**: Business locations and queue information
- **Credit System**: SMS and customer credit tracking
- **Subscription Data**: Plan details and billing information

### 🔧 **Development Tools**

- **TypeScript**: Type-safe JavaScript
- **ESLint**: Code linting and formatting
- **PostCSS**: CSS processing
- **Hot Reload**: Instant development feedback

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- MongoDB database
- Stripe account (for payments)

### Installation

```bash
# Clone the repository
git clone https://github.com/bryansbtian/seat-ping.git
cd seat-ping

# Install dependencies
npm install
npm i -D prisma
npm i @prisma/client

# Generate db client and push
npx prisma generate
npx prisma db push

# Start development server
npm run dev
```

## API Endpoints

### Authentication

- `POST /auth/signup` - User registration
- `POST /auth/login` - User login
- `POST /auth/forgot-password` - Password reset request
- `POST /auth/reset-password` - Password reset confirmation

### Business Management

- `GET /admin/users` - Get all users (admin)
- `POST /admin/users/:id/plan` - Update user plan (admin)
- `GET /business/dashboard` - Business dashboard data
- `POST /business/locations` - Add new location
- `PUT /business/locations/:id` - Update location

### Payments

- `POST /stripe/create-checkout-session` - Create payment session
- `POST /stripe/webhook` - Stripe webhook handler
- `GET /stripe/test-db` - Database connection test (dev)

## Database Schema

### User Model

```typescript
{
  id: string; // Unique user ID
  name: string; // User's full name
  username: string; // Unique username
  email: string; // User's email
  phone: string; // User's phone number
  password: string; // Hashed password
  customerId: string; // Stripe customer ID
  plan: string; // Current subscription plan
  locations: Array; // User's business locations
  trial: boolean; // Trial status
  trialDurationDays: number; // Trial length
  maxLocations: number; // Maximum allowed locations
  baseCustomerCredits: number; // Monthly customer credits
  baseSMSCredits: number; // Monthly SMS credits
  planStartedAt: Date; // Plan start date
  createdAt: Date; // Account creation date
  updatedAt: Date; // Last update date
}
```
