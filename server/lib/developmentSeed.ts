import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { PrismaClient, type Prisma } from "@prisma/client";
import { assertLocalDevelopmentDatabase } from "./developmentDatabase.js";

export async function seedDevelopmentData(rawUrl: string): Promise<void> {
  const datasourceUrl = assertLocalDevelopmentDatabase(rawUrl);
  const db = new PrismaClient({ datasourceUrl });
  try {
    const password = await bcrypt.hash(randomUUID(), 10);
    await db.$transaction(
      async (tx) => {
        for (const [index, name] of ["Harbor Kitchen", "Garden Table"].entries()) {
          const id = `dev-demo-business-${index}`;
          const username = `demo-restaurant-${index + 1}`;
          await tx.business.upsert({
            where: { id },
            update: {},
            create: {
              id,
              name,
              username,
              email: `${username}@example.test`,
              phone: "+12025550123",
              password,
              trial: false,
              baseCredits: 1000,
              maxLocations: 3,
            },
          });
          const locationId = `dev-demo-location-${index}`;
          await tx.location.upsert({
            where: { id: locationId },
            update: {},
            create: {
              id: locationId,
              businessId: id,
              businessUsername: username,
              name: "Main Branch",
              displayName: "Main Branch",
              address: "100 Demo Street",
              city: "Jakarta",
              country: "Indonesia",
              credits: 1000,
              baseCredits: 1000,
              restaurantProfile: {
                name,
                cuisine: "International",
                description: "Local development demo restaurant.",
              },
            },
          });
          await tx.featuredRestaurant.upsert({
            where: { locationId },
            update: {},
            create: {
              id: `dev-demo-featured-${index}`,
              businessId: id,
              locationId,
              sortOrder: index,
            },
          });
        }
        const tickets = [
          {
            subject: "Help Setting Up Reservations",
            type: "feedback",
            feedbackType: "support",
            status: "open",
            priority: "high",
            message: "How do I configure our reservation hours?",
          },
          {
            subject: "Mobile Queue Feedback",
            type: "feedback",
            feedbackType: "bug",
            status: "in_progress",
            priority: "medium",
            message: "The queue page needs a clearer arrival instruction.",
          },
          {
            subject: "Campaign Setup Question",
            type: "feedback",
            feedbackType: "support",
            status: "closed",
            priority: "low",
            message: "Can you help us plan a guest reactivation campaign?",
          },
        ];
        for (const [index, ticket] of tickets.entries()) {
          const id = `dev-demo-ticket-${index}`;
          const { feedbackType, message, ...fields } = ticket;
          await tx.ticket.upsert({
            where: { id },
            update: {},
            create: {
              id,
              ...fields,
              ticketNumber: `DEMO-${1001 + index}`,
              senderName: "Demo Operator",
              senderEmail: "operator@example.test",
              businessName: "Harbor Kitchen",
              data: { feedbackType, severity: "medium" },
              messages: [
                {
                  sender: "Demo Operator",
                  message,
                  timestamp: new Date().toISOString(),
                  isTeamResponse: false,
                },
              ],
              thread: {
                create: {
                  id: `${id}-initial`,
                  sender: "Demo Operator",
                  senderEmail: "operator@example.test",
                  message,
                  isTeamResponse: false,
                  status: "RECEIVED",
                },
              },
            },
          });
        }
        const statuses = ["DRAFT", "PENDING_SEATPING_REVIEW", "APPROVED"] as const;
        for (const [index, approvalStatus] of statuses.entries()) {
          let submittedAt: Date | null = null;
          if (approvalStatus !== "DRAFT") {
            submittedAt = new Date();
          }
          await tx.campaignTemplate.upsert({
            where: { id: `dev-demo-template-${index}` },
            update: {},
            create: {
              id: `dev-demo-template-${index}`,
              businessId: "dev-demo-business-0",
              businessUsername: "demo-restaurant-1",
              locationId: "dev-demo-location-0",
              templateType: "CUSTOM",
              approvalStatus,
              submittedAt,
              name: ["Birthday Treat", "Welcome Back", "Weekend Invitation"][index],
              slug: `demo_template_${index}`,
              purpose: "Invite guests to visit again.",
              body: "Hi {{first_name}}, we look forward to welcoming you back to {{business_name}}.",
              variables: ["first_name", "business_name"],
              exampleValues: { first_name: "Alex", business_name: "Harbor Kitchen" },
            },
          });
        }
        await tx.blogPost.upsert({
          where: { id: "dev-demo-blog" },
          update: {},
          create: {
            id: "dev-demo-blog",
            title: "Welcome To The SeatPing Demo",
            slug: "development-demo",
            author: "SeatPing Team",
            category: "Operations",
            tags: ["demo"],
            excerpt: "A local draft for trying the blog editor.",
            content: {
              type: "doc",
              content: [
                {
                  type: "heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "A Better Guest Experience" }],
                },
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Try Markdown shortcuts, tables, and media in this local draft.",
                    },
                  ],
                },
              ],
            },
          },
        });
        await seedAdminExamples(tx, password, new Date());
      },
      { timeout: 30000 },
    );
  } finally {
    await db.$disconnect();
  }
}

async function seedAdminExamples(tx: Prisma.TransactionClient, password: string, now: Date) {
  const names = [
    "Cedar And Sage",
    "Maple Corner Cafe",
    "Lotus Garden",
    "The Copper Spoon",
    "Morning Tide",
    "Juniper House",
    "Bamboo Terrace",
    "Orchard Bistro",
    "Olive And Rye",
    "The Lantern Room",
    "Wildflower Kitchen",
    "Stonebridge Grill",
    "Saffron Table",
    "Little Fern Cafe",
    "Palm And Pepper",
    "Bluebird Bakery",
    "The Willow Pantry",
    "Marigold Dining",
    "Seaside Noodle House",
    "Oakwood Pizzeria",
    "Lemon Grove",
    "The Courtyard",
    "Magnolia Supper Club",
    "Saltwater Kitchen",
    "Golden Hour Coffee",
    "Riverbend Deli",
    "Pearl And Pine",
    "Sunroom Eatery",
    "The Weekend Table",
    "North Star Ramen",
  ];
  const cities = ["Jakarta", "Bandung", "Surabaya"];
  const cuisines = ["Indonesian", "Japanese", "Italian", "International", "Chinese"];
  const dateAgo = (days: number) => new Date(now.getTime() - days * 86400000);
  for (const [index, name] of names.entries()) {
    const businessId = `dev-admin-business-${index}`;
    const username = `demo-admin-restaurant-${index + 1}`;
    const trial = index % 3 === 0;
    const createdAt = dateAgo(2 + index * 3);
    let creditsStartedAt: Date | null = createdAt;
    if (trial) {
      creditsStartedAt = null;
    }
    await tx.business.upsert({
      where: { id: businessId },
      update: {},
      create: {
        id: businessId,
        name,
        username,
        password,
        email: `${username}@example.test`,
        phone: `+12025550${String(100 + index)}`,
        trial,
        trialDurationDays: 7 + (index % 2) * 7,
        maxLocations: 3,
        baseCredits: 300 + (index % 5) * 250,
        creditsStartedAt,
        createdAt,
        updatedAt: dateAgo(index % 5),
      },
    });
    for (let branch = 0; branch < 1 + (index % 3); branch += 1) {
      const locationId = `dev-admin-location-${index}-${branch}`;
      const displayName = ["Main Branch", "Garden Branch", "Riverside Branch"][branch];
      await tx.location.upsert({
        where: { id: locationId },
        update: {},
        create: {
          id: locationId,
          businessId,
          businessUsername: username,
          name: displayName,
          displayName,
          address: `${100 + index * 5 + branch} Demo Avenue`,
          city: cities[index % cities.length],
          country: "Indonesia",
          credits: 100 + index * 25,
          baseCredits: 300 + (index % 5) * 250,
          isPublished: true,
          restaurantProfile: {
            displayName: name,
            shortAddress: displayName,
            cuisine: cuisines[index % cuisines.length],
            priceRange: "$$",
            description: `A fictional ${cities[index % cities.length]} restaurant for local development.`,
          },
          createdAt,
        },
      });
      if (index < 10 && branch === 0) {
        await tx.featuredRestaurant.upsert({
          where: { locationId },
          update: {},
          create: {
            id: `dev-admin-featured-${index}`,
            businessId,
            locationId,
            sortOrder: index + 2,
            isActive: index % 5 !== 4,
          },
        });
      }
    }
  }

  const ticketSubjects = [
    "Reservation Confirmation Not Arriving",
    "Updating Weekend Opening Hours",
    "Help Importing Our Guest List",
    "Queue Position Refresh On Mobile",
    "Question About Monthly Credits",
    "Setting Up A Second Location",
    "Feedback On The New Booking Calendar",
    "Cannot Update Restaurant Photos",
    "Campaign Template Approval Question",
    "Adding A Team Member",
    "Suggestion For Reservation Reminders",
    "Changing The Restaurant Contact Details",
  ];
  const ticketBodies = [
    "Could you help us check the reservation confirmation settings for our location?",
    "We are preparing for a busy weekend and would like advice on the best setup.",
    "The page works on desktop, but we noticed a display issue on a smaller phone.",
    "We would appreciate a clearer explanation of how this feature works.",
  ];
  const statuses = ["open", "in_progress", "closed"];
  const priorities = ["high", "medium", "low"];
  const feedbackTypes = ["support", "bug", "suggestion", "billing", "ux", "general"];
  for (let index = 0; index < 48; index += 1) {
    const id = `dev-admin-ticket-${index}`;
    const createdAt = dateAgo((48 - index) / 2);
    const updatedAt = new Date(createdAt.getTime() + 3600000);
    const sender = ["Alex Morgan", "Jamie Chen", "Taylor Brooks", "Riley Parker"][index % 4];
    const senderEmail = `demo-operator-${index + 1}@example.test`;
    const message = ticketBodies[index % ticketBodies.length];
    const messages = [
      {
        id: `${id}-customer`,
        sender,
        senderEmail,
        message,
        isTeamResponse: false,
        status: "RECEIVED",
        createdAt,
      },
    ];
    if (index % 3 !== 0) {
      messages.push({
        id: `${id}-team`,
        sender: "SeatPing Team",
        senderEmail: "support@example.test",
        message:
          "Thanks for the details. We have reviewed your setup and shared the next steps for your team.",
        isTeamResponse: true,
        status: "SENT",
        createdAt: updatedAt,
      });
    }
    await tx.ticket.upsert({
      where: { id },
      update: {},
      create: {
        id,
        ticketNumber: `DEMO-ADMIN-${String(2001 + index)}`,
        type: "feedback",
        status: statuses[index % 3],
        priority: priorities[Math.floor(index / 3) % 3],
        subject: ticketSubjects[index % ticketSubjects.length],
        senderName: sender,
        senderEmail,
        businessName: names[index % names.length],
        data: {
          feedbackType: feedbackTypes[index % feedbackTypes.length],
          severity: priorities[index % 3],
        },
        messages: messages.map((entry) => ({
          id: entry.id,
          sender: entry.sender,
          message: entry.message,
          timestamp: entry.createdAt.toISOString(),
          isTeamResponse: entry.isTeamResponse,
          status: entry.status,
        })),
        thread: { create: messages },
        createdAt,
        updatedAt,
      },
    });
  }

  const templateNames = [
    "Weekend Tasting Menu",
    "Birthday Dessert Invitation",
    "Welcome Back Lunch Offer",
    "New Seasonal Menu",
    "Quiet Afternoon Coffee",
    "Family Dinner Invitation",
    "Guest Appreciation Evening",
    "Holiday Opening Hours",
  ];
  const approvalStatuses = ["DRAFT", "PENDING_SEATPING_REVIEW", "APPROVED", "REJECTED"] as const;
  for (let index = 0; index < 24; index += 1) {
    const approvalStatus = approvalStatuses[index % 4];
    const createdAt = dateAgo(24 - index);
    let submittedAt: Date | null = createdAt;
    let approvedAt: Date | null = null;
    let rejectedAt: Date | null = null;
    let rejectionReason: string | null = null;
    if (approvalStatus === "DRAFT") {
      submittedAt = null;
    }
    if (approvalStatus === "APPROVED") {
      approvedAt = new Date(createdAt.getTime() + 3600000);
    }
    if (approvalStatus === "REJECTED") {
      rejectedAt = new Date(createdAt.getTime() + 3600000);
      rejectionReason =
        "Please include a clear offer expiry date and remove the unsupported promotional claim.";
    }
    await tx.campaignTemplate.upsert({
      where: { id: `dev-admin-template-${index}` },
      update: {},
      create: {
        id: `dev-admin-template-${index}`,
        businessId: `dev-admin-business-${index}`,
        businessUsername: `demo-admin-restaurant-${index + 1}`,
        locationId: `dev-admin-location-${index}-0`,
        templateType: "CUSTOM",
        approvalStatus,
        name: templateNames[index % templateNames.length],
        slug: `dev_admin_template_${index + 1}`,
        purpose: "Invite returning guests to explore a new experience at the restaurant.",
        body: "Hi {{first_name}}, join us at {{business_name}} for {{offer}} this weekend. We would love to welcome you back.",
        variables: ["first_name", "business_name", "offer"],
        exampleValues: {
          first_name: "Alex",
          business_name: names[index],
          offer: "our seasonal tasting menu",
        },
        submittedAt,
        approvedAt,
        rejectedAt,
        rejectionReason,
        sortOrder: index,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + 3600000),
      },
    });
  }

  const articleTitles = [
    "Making Every Guest Feel Welcome",
    "Planning A Smooth Weekend Service",
    "A Practical Guide To Guest Follow-Ups",
    "Introducing Your New Seasonal Menu",
    "Designing A Better Arrival Experience",
    "Getting More From Your Guest CRM",
    "Reservation Tips For Busy Restaurants",
    "Building A Thoughtful Loyalty Campaign",
    "Helping First-Time Guests Find Their Way",
    "Keeping Your Restaurant Profile Fresh",
    "How To Write A Clear Campaign Message",
    "Managing A Growing Restaurant Team",
    "Turning Guest Feedback Into Improvements",
    "Preparing For Holiday Reservations",
    "Small Details That Improve Table Turnover",
    "Organizing Your Restaurant Locations",
    "Writing A Helpful Restaurant Update",
    "A Simple Checklist For Opening Day",
  ];
  const categories = ["Operations", "Guest Experience", "Product", "Campaigns"];
  const authors = ["SeatPing Team", "Alex Morgan", "Jamie Chen"];
  for (const [index, title] of articleTitles.entries()) {
    let status: "DRAFT" | "PUBLISHED" = "DRAFT";
    let publishedAt: Date | null = null;
    if (index % 2 === 0) {
      status = "PUBLISHED";
      publishedAt = dateAgo(18 - index);
    }
    await tx.blogPost.upsert({
      where: { id: `dev-admin-blog-${index}` },
      update: {},
      create: {
        id: `dev-admin-blog-${index}`,
        title,
        slug: `dev-demo-${index + 1}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        author: authors[index % authors.length],
        category: categories[index % categories.length],
        tags: ["demo", ["Hospitality", "Service", "Growth"][index % 3]],
        excerpt:
          "Practical ideas for creating a calmer service and a more welcoming experience for every guest.",
        status,
        publishedAt,
        createdAt: dateAgo(20 - index),
        updatedAt: dateAgo((18 - index) / 2),
        content: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: title }] },
            {
              type: "paragraph",
              content: [
                { type: "text", text: "A great guest experience starts with " },
                { type: "text", text: "clear communication", marks: [{ type: "bold" }] },
                { type: "text", text: " and small details that help your team work confidently." },
              ],
            },
            {
              type: "bulletList",
              content: [
                "Review your opening hours before service.",
                "Keep guest notes clear and useful.",
                "Follow up with a thoughtful message.",
              ].map((text) => ({
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text }] }],
              })),
            },
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Make the next step easy for both your guests and your team.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    });
  }
}
