import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { assertLocalDevelopmentDatabase } from "../server/lib/developmentDatabase.js";
import { blogFieldsSchema, blogSlug, newBlogFields } from "../shared/blog.js";

const photos = [
  "https://images.unsplash.com/photo-1782983595068-f44e5332f468?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1753727471014-efe38840c7c7?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1766832255363-c9f060ade8b0?auto=format&fit=crop&w=1600&q=85",
];

const articles = [
  {
    title: "A Better Evening Starts Before You Arrive",
    excerpt:
      "A little planning makes room for a better meal. Here’s how to choose a restaurant, book a table, and make your arrival feel effortless.",
    category: "Guides",
    categoryColor: "info",
    tags: ["Dining Out", "Reservations", "Guest Experience"],
    published: true,
    sections: [
      [
        "Start With The Occasion",
        "A quick lunch, a quiet catch-up, and a birthday dinner ask different things of a restaurant. Before browsing menus, decide what matters most to your group: location, atmosphere, dietary needs, or enough time to linger. A clear starting point makes the choice easier for everyone.",
        "Look at the restaurant’s public page for practical details as well as inspiration. Check the address, opening hours, available menu information, and recent guest feedback. If your plans depend on a particular dish or accessibility requirement, confirm that detail with the restaurant before you travel.",
      ],
      [
        "Give Your Reservation The Right Details",
        "Use the number of people who will actually be dining when you reserve. A party of two and a party of six need different space, and an accurate guest count helps the restaurant plan its tables. Pick a time your group can realistically reach together.",
        "Save your reservation confirmation somewhere easy to find. If your plans change, use the available reservation management options or contact the venue. Updating a booking early gives the team a chance to adapt, and another guest a chance to enjoy the table.",
      ],
      [
        "Make The Wait Part Of Your Plans",
        "If a restaurant uses a virtual queue, you can join without standing in a crowded entrance. Read the venue’s queue instructions carefully, keep your contact details accurate, and stay close enough to return when the team calls you. A queue position is different from a confirmed table reservation.",
        "Treat any estimated wait as a guide. Parties finish at different times, tables need resetting, and some groups need particular seating. Keeping a little flexibility in your evening makes those changes much less frustrating.",
      ],
      [
        "Arrive Ready To Enjoy Your Meal",
        "Let your group know the meeting point and booking name before you leave. Keep your confirmation within reach, check in with the host when you arrive, and mention any important needs clearly. Small details like these help the team welcome you without slowing down the doorway.",
        "The best plans leave a little breathing room. Choose the right setting, share accurate information, and keep the restaurant informed when something changes. Then you can focus on the reason you came: good food and good company.",
      ],
    ],
  },
  {
    title: "The Friday Night Service Checklist",
    excerpt:
      "A practical opening routine for teams balancing walk-ins, reservations, and a dining room that fills up quickly.",
    category: "Operations",
    categoryColor: "success",
    tags: ["Restaurant Operations", "Queues", "Floor Management"],
    published: true,
    sections: [
      [
        "Start With A Shared Picture",
        "Before the first arrival, bring the host and floor team together for a short briefing. Review the evening’s reservations, larger parties, and any changes to available seating. Everyone should know who owns the queue and who makes the final call on table readiness.",
        "Look beyond the number of bookings. A cluster of arrivals in the same quarter-hour creates a different workload from the same number spread across an evening. Plan the welcome, seating, and first service steps around the busiest moments.",
      ],
      [
        "Check The Tables You Can Actually Use",
        "Confirm which tables are available and which are out of service. When your location uses dining table inventory, keep that inventory aligned with the real floor. Reservation availability depends on the full occupancy window, so an incorrect table setup can affect more than one booking time.",
        "Walk the room with a practical eye. A table marked available should be ready for a guest, not waiting for a reset or blocked by equipment. A quick physical check prevents awkward handovers later.",
      ],
      [
        "Keep Walk-Ins And Bookings In View",
        "Reservations and queues serve different guest needs, but the host has to manage them together. Review upcoming bookings before seating a new party. Use accurate party sizes and keep the queue current when guests leave, are admitted, or change their plans.",
        "Agree on a simple way to communicate delays. Give guests the information you have, explain what the next step will be, and update them when the situation changes. A calm, consistent message is more useful than a precise promise the team cannot keep.",
      ],
      [
        "Close The Loop After Service",
        "At the end of the evening, note where the process became difficult. Was the entrance crowded? Did a large party arrive early? Did the floor and host disagree about a table’s state? Capture the operational issue and one change to try next time.",
        "Keep the checklist short enough to use on a busy shift. A shared plan, accurate seating information, and clear ownership give the team a stronger foundation than a long document nobody can reach during service.",
      ],
    ],
  },
  {
    title: "A Thoughtful Welcome For Every Returning Guest",
    excerpt:
      "Useful guest notes help hospitality feel personal. Start with the details that make a visit easier, and keep the process simple for your team.",
    category: "Guest Experience",
    categoryColor: "warning",
    tags: ["Guest CRM", "Hospitality", "Returning Guests"],
    published: true,
    sections: [
      [
        "Remember What Helps The Visit",
        "A good guest note has a clear purpose. A preferred seating area, a communication preference, or an important request can help the team prepare for the next visit. Record details that improve service, using respectful and factual language.",
        "Avoid turning notes into a running commentary about a person. If a detail does not help the next operator make a useful decision, it probably does not belong in the record. Keep sensitive information out of casual notes and follow your business’s privacy practices.",
      ],
      [
        "Make Notes Easy To Understand",
        "Write for a colleague who was not there. A short, specific sentence is easier to use than an abbreviation only one person understands. Distinguish what the guest requested from what the team assumed, and update information when the guest tells you it has changed.",
        "Keep the most useful information easy to spot. A long history can hide the one detail needed at arrival. Review notes during a quiet moment rather than asking the host to interpret them while several parties are waiting.",
      ],
      [
        "Use Recognition With Care",
        "Recognition should make a guest feel comfortable. A warm welcome and a prepared table often do more than repeating personal details aloud. Share relevant information with the team members who need it, and keep the conversation natural.",
        "When a request cannot be met, be direct and kind. Explain the available options and let the guest choose. Good records support the team, but they do not replace a thoughtful conversation in the moment.",
      ],
      [
        "Build A Habit The Team Can Keep",
        "Choose a simple routine for reviewing guest information and recording useful updates after service. Give the team examples of clear notes, and revisit the routine when you notice repeated confusion. Consistency matters more than collecting every possible detail.",
        "The goal of a guest CRM is practical hospitality: less repetition for the guest, better preparation for the team, and a welcome that reflects what the business actually knows. Start small and keep the information useful.",
      ],
    ],
  },
  {
    title: "Queues And Reservations, Working Together",
    excerpt:
      "Two ways to plan a visit, one view for the team. A closer look at how SeatPing helps restaurants manage arrivals and seating.",
    category: "Product",
    categoryColor: "info",
    tags: ["SeatPing", "Reservations", "Virtual Queues"],
    published: true,
    sections: [
      [
        "Different Plans, The Same Dining Room",
        "Some guests know their plans days ahead. Others decide to visit while walking past your restaurant. Reservations help the first group plan a time; a virtual queue helps the second group wait without gathering around the host stand. Both workflows need a clear operational view.",
        "SeatPing brings queues, reservations, and guest information into the business dashboard. The value is in the everyday handoff: seeing who is expected, keeping party details accurate, and updating the guest’s state when the team takes action.",
      ],
      [
        "Let Table Inventory Inform Availability",
        "For locations with dining tables configured, reservation availability checks the real table inventory across the full occupancy window. Accepted reservations receive a smart table assignment, and changing a reservation or moving it to a terminal status releases the assignment.",
        "This makes accurate setup important. Keep the floor plan, table capacities, and reservation settings aligned with the venue. Locations without configured tables continue to use the guest-count approach, so the availability model reflects the way that location is set up.",
      ],
      [
        "Keep The Guest Journey Clear",
        "A reservation is auto-confirmed when accepted. A queue entry is a different commitment: the guest is waiting for the team to admit them when seating is ready. Use clear language so guests understand which journey they joined and what they should do next.",
        "Your public restaurant page can help visitors decide before arrival. Keep useful information current, and make it easy for the guest to follow the venue’s available booking or queue flow. Clear expectations at the start reduce questions at the door.",
      ],
      [
        "Make Each Update Count",
        "During service, update the system as the real situation changes. A guest who has left should not remain in the active queue. A changed reservation should reflect the new plan. These small actions keep the next operator’s decisions grounded in current information.",
        "Queues and reservations work best when the team treats them as part of the same arrival experience. SeatPing supplies the shared tools; the restaurant’s own service judgment connects them to the room.",
      ],
    ],
  },
  {
    title: "Write A Restaurant Update Guests Want To Read",
    excerpt:
      "From a seasonal menu to a special evening, a clear campaign starts with one useful message and a relevant audience.",
    category: "Campaigns",
    categoryColor: "success",
    tags: ["Campaigns", "Email", "Guest Communication"],
    published: false,
    sections: [
      [
        "Choose One Reason To Reach Out",
        "Start with the information the guest will find useful. A new menu, a change in opening hours, or an upcoming event gives the message a clear purpose. Trying to fit several unrelated announcements into one campaign makes the next step harder to understand.",
        "Write a short opening that explains what is happening and when. Keep the most important details in the message itself, and link to a relevant page when the guest needs more information.",
      ],
      [
        "Match The Audience To The Message",
        "A useful audience is more specific than everyone in your records. Think about who the update is relevant to and check the audience before sending. Respect the guest’s channel preferences and your business’s consent practices.",
        "SeatPing provides email, WhatsApp, and SMS campaign tools. Paid messaging channels consume credits while email does not. Review the channel, audience, and available credits as part of your preparation, and keep the daily recipient limits in mind.",
      ],
      [
        "Make The Next Step Clear",
        "Give the reader one clear action. If you want them to view the menu, make the menu link easy to find. If the message is simply an opening-hours update, it may not need a promotional call to action at all.",
        "Read the message on a small screen before you approve it. Short paragraphs, accurate dates, and a descriptive link help the guest understand the update without extra effort.",
      ],
      [
        "Review Before Sending",
        "Check the audience, links, spelling, and timing with the same care you give the wording. Ask a colleague to read the message as a guest would. A quick second look often catches missing context that the writer no longer notices.",
        "Keep a record of what the campaign was intended to achieve. After sending, review the available results and use what you learn to make the next message more relevant.",
      ],
    ],
  },
  {
    title: "Make Your Restaurant Page Useful Before The First Visit",
    excerpt:
      "A practical refresh for the photos, location details, and service information guests check before they decide where to eat.",
    category: "Guides",
    categoryColor: "info",
    tags: ["Restaurant Discovery", "Public Pages", "First Visits"],
    published: false,
    sections: [
      [
        "Answer The Practical Questions First",
        "Before choosing a restaurant, a guest needs to know where it is, whether it is open, and whether the visit suits their plans. Review the address and opening hours from a visitor’s perspective. A small error can turn an otherwise good first impression into a wasted journey.",
        "Keep descriptions specific. Explain what the venue offers using language that matches the experience. Clear information helps the guest choose with confidence and gives the team fewer misunderstandings to resolve later.",
      ],
      [
        "Use Photos That Reflect The Venue",
        "Choose images that show the restaurant as a guest will find it. Include the dining space as well as food where those photos are available. Keep the crop intentional and avoid images that make the room difficult to understand.",
        "Review older images when the space or menu changes. A beautiful photo is less useful if it sets an expectation the current venue cannot meet. Consistency between the public page and the visit builds trust.",
      ],
      [
        "Explain How To Plan An Arrival",
        "Check the booking and queue options enabled for the location. Guests should be able to tell whether they can reserve a table, join a queue, or contact the venue for a particular request. Explain the difference using everyday language.",
        "Ask a colleague to follow the page on a phone. Check the key details and the available actions without relying on prior knowledge of the venue. The first-time guest should not need a host to explain the page.",
      ],
      [
        "Give The Page A Regular Review",
        "Make a brief page review part of your operating routine. Recheck the details before holidays, menu changes, or a change in service hours. Assign someone to own updates so the task does not get lost between shifts.",
        "A useful restaurant page is a small extension of hospitality. It welcomes the guest before they arrive, helps them plan, and makes the first conversation at the door easier.",
      ],
    ],
  },
];

export async function replaceDevelopmentBlogs(
  rawUrl: string | undefined,
): Promise<{ published: number; drafts: number }> {
  const datasourceUrl = assertLocalDevelopmentDatabase(rawUrl);
  const db = new PrismaClient({ datasourceUrl, log: [] });
  try {
    const posts = articles.map((article, index) => {
      const content = {
        type: "doc",
        content: article.sections.flatMap(([title, ...paragraphs]) => [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: title }] },
          ...paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
        ]),
      };
      const fields = blogFieldsSchema.parse({
        ...newBlogFields(),
        title: article.title,
        slug: blogSlug(article.title),
        excerpt: article.excerpt,
        category: article.category,
        categoryColor: article.categoryColor,
        tags: article.tags,
        coverUrl: photos[index % photos.length],
        coverAlt: "A restaurant dining room prepared for guests",
        content,
      });
      let status: "DRAFT" | "PUBLISHED" = "DRAFT";
      let publishedAt: Date | null = null;
      if (article.published) {
        status = "PUBLISHED";
        publishedAt = new Date(Date.now() - (index + 1) * 86400000);
      }
      return { ...fields, content, status, publishedAt };
    });
    await db.$transaction(async (tx) => {
      await tx.blogPost.deleteMany();
      await tx.blogPost.createMany({ data: posts });
    });
    return {
      published: posts.filter((post) => post.status === "PUBLISHED").length,
      drafts: posts.filter((post) => post.status === "DRAFT").length,
    };
  } finally {
    await db.$disconnect();
  }
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      "Run this script with NODE_ENV=development against the local development database.",
    );
  }
  void replaceDevelopmentBlogs(process.env.DATABASE_URL)
    .then((counts) => {
      console.log(
        `Replaced local development blogs: ${counts.published} published, ${counts.drafts} drafts.`,
      );
    })
    .catch(() => {
      console.error(
        "Unable to replace local development blogs. Verify the local database configuration.",
      );
      process.exitCode = 1;
    });
}
