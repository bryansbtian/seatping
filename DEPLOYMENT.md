# SeatPing Deployment Guide

This guide will help you deploy SeatPing to Render or any other hosting platform.

## Prerequisites

- GitHub account with your code pushed to a repository
- Render account (or your preferred hosting platform)
- MongoDB Atlas database (or your MongoDB instance)
- Stripe account with API keys
- Twilio account with API keys (if using SMS features)
- Email account for nodemailer

## Render Deployment Configuration

### 1. Build Command

```bash
npm install && npx prisma generate && npm run build
```

This will:
- Install all dependencies
- Generate Prisma client
- Build the React frontend (Vite)
- Compile the TypeScript server code

### 2. Start Command

```bash
npm start
```

This runs the production server which serves both the API and static frontend files.

### 3. Environment Variables

Set these in your Render dashboard (or `.env` file for local development):

#### Database
```
DATABASE_URL=mongodb+srv://username:password@cluster.mongodb.net/database_name
```

#### Authentication
```
JWT_SECRET=your-secure-random-secret-key
JWT_EXPIRES_IN=7d
```

#### Server Configuration
```
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://your-app-name.onrender.com
FRONTEND_URL=https://your-app-name.onrender.com
```

#### Email Configuration (Gmail example)
```
EMAIL_PASSWORD=your-gmail-app-password
```
Note: For Gmail, you need to generate an [App Password](https://support.google.com/accounts/answer/185833)

#### Stripe Configuration
```
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_stripe_publishable_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

#### Twilio Configuration (if using SMS)
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

## Step-by-Step Render Deployment

### 1. Create a New Web Service

1. Log in to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Select your SeatPing repository

### 2. Configure the Service

- **Name**: seatping (or your preferred name)
- **Region**: Choose closest to your users
- **Branch**: main (or your production branch)
- **Root Directory**: Leave blank
- **Environment**: Node
- **Build Command**: `npm install && npx prisma generate && npm run build`
- **Start Command**: `npm start`
- **Plan**: Choose appropriate plan (Free tier available for testing)

### 3. Add Environment Variables

1. Scroll to **Environment Variables** section
2. Click **Add Environment Variable**
3. Add all the variables listed above
4. Click **Create Web Service**

### 4. Configure Stripe Webhooks

After deployment:

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Set endpoint URL: `https://your-app-name.onrender.com/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Copy the **Signing secret** and add it as `STRIPE_WEBHOOK_SECRET` environment variable
6. Redeploy your service if needed

### 5. Update CLIENT_ORIGIN

After your first deployment:

1. Copy your Render URL (e.g., `https://seatping.onrender.com`)
2. Update the `CLIENT_ORIGIN` environment variable with this URL
3. Redeploy if needed

## Monitoring and Logs

- View logs in Render Dashboard under **Logs** tab
- Monitor errors and server status
- Check for any environment variable issues

## Database Setup

### MongoDB Atlas

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a database user
3. Whitelist all IPs (0.0.0.0/0) for Render deployment
4. Get connection string and add to `DATABASE_URL`
5. Prisma will automatically create collections on first run

## Post-Deployment Checklist

- [ ] Verify all environment variables are set correctly
- [ ] Test user registration and login
- [ ] Test Stripe payment flow
- [ ] Verify email sending works
- [ ] Test SMS notifications (if using Twilio)
- [ ] Check all API endpoints are working
- [ ] Test both desktop and mobile views
- [ ] Verify SSL certificate is active (automatic with Render)

## Troubleshooting

### Build Fails
- Check Node.js version compatibility
- Verify all dependencies are in `package.json`
- Check build logs for specific errors

### Server Crashes
- Check environment variables are set correctly
- Verify DATABASE_URL is valid
- Check server logs for errors

### Stripe Webhooks Not Working
- Verify webhook URL is correct
- Check webhook signing secret matches
- Ensure `/stripe` route is mounted before body parsers

### CORS Errors
- Verify `CLIENT_ORIGIN` matches your deployed URL
- Check that credentials are enabled in CORS config

## Local Development

To test the production build locally:

```bash
# Build the app
npm run build

# Set NODE_ENV
export NODE_ENV=production  # On macOS/Linux
set NODE_ENV=production     # On Windows

# Start the server
npm start
```

## Continuous Deployment

Render automatically deploys when you push to your main branch:

1. Make changes locally
2. Commit and push to GitHub
3. Render will automatically detect changes and redeploy

## Security Notes

- Never commit `.env` file to git (already in `.gitignore`)
- Use strong, unique values for `JWT_SECRET`
- Rotate Stripe webhook secrets periodically
- Use Stripe test keys during development
- Keep all API keys secure and never expose in frontend code

## Custom Domain (Optional)

To use a custom domain:

1. Go to your Render service settings
2. Click **Custom Domains**
3. Add your domain
4. Update DNS records as instructed
5. Update `CLIENT_ORIGIN` to your custom domain

## Support

For issues:
- Check [Render Documentation](https://render.com/docs)
- Review server logs
- Check environment variables
- Verify database connectivity
