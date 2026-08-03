import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Users, Store } from "lucide-react";

type Faq = { question: string; answer: string };

const CUSTOMER_FAQS: Faq[] = [
  {
    question: "How do I join a queue?",
    answer:
      "Open the restaurant’s SeatPing page or scan their QR Code, enter your details, and choose how you want to be notified.",
  },
  {
    question: "How do I know when my table is ready?",
    answer:
      "SeatPing will notify you using the contact method you selected, such as SMS, WhatsApp, or Email, when the restaurant is ready for you.",
  },
  {
    question: "Can I manage or cancel my reservation?",
    answer:
      "Yes. Use the manage reservation link from your confirmation email to view, update, or cancel your reservation when available.",
  },
  {
    question: "Do I need an account to book or join a queue?",
    answer:
      "No account is needed at all! You can book a table or join a queue as a guest. Creating an account is optional, and simply helps you keep track of your upcoming reservations and queue activity.",
  },
  {
    question: "What should I do if I do not receive a notification?",
    answer:
      "Check that your contact details are correct and that your phone or email can receive messages. You can also contact the restaurant directly if your reservation or queue status is urgent.",
  },
];

const BUSINESS_FAQS: Faq[] = [
  {
    question: "How does SeatPing notify my guests?",
    answer:
      "Guests can receive queue and reservation updates through SMS, WhatsApp, or Email, depending on the notification methods enabled in your setup.",
  },
  {
    question: "Can I manage multiple locations?",
    answer:
      "Yes. SeatPing supports multiple business locations, and each location can manage its own queues, reservations, QR Codes, and usage counters.",
  },
  {
    question: "How do QR Codes work?",
    answer:
      "Each location can have its own QR Code for its waitlist. Guests scan it to open the correct queue flow and join the waitlist for that location. (Reservations are made from the restaurant’s SeatPing page, not the QR Code.)",
  },
  {
    question: "Can I customize reservations and opening hours?",
    answer:
      "Yes. From the business dashboard, you can configure opening hours, reservation availability, number of guests limits, and guest capacity settings.",
  },
  {
    question: "What happens if my credits run out?",
    answer:
      "Each notification, whether SMS, WhatsApp, or Email, consumes one credit. When a location has no credits left, SeatPing prevents new notifications from being sent, so guests won’t be able to join the waitlist or trigger updates until you top up your credits.",
  },
];

const FaqSection = ({
  title,
  icon,
  faqs,
  idPrefix,
}: {
  title: string;
  icon: React.ReactNode;
  faqs: Faq[];
  idPrefix: string;
}) => (
  <Card className="border rounded-2xl shadow-sm bg-card/80 backdrop-blur-sm">
    <CardHeader>
      <CardTitle className="flex items-center gap-3 text-xl sm:text-2xl text-primary">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          {icon}
        </span>
        {title}
      </CardTitle>
    </CardHeader>
    <CardContent className="pb-0">
      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem
            key={`${idPrefix}-${i}`}
            value={`${idPrefix}-${i}`}
            className="last:border-b-0"
          >
            <AccordionTrigger className="text-left text-base font-medium hover:no-underline">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-sm sm:text-base text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </CardContent>
  </Card>
);

const Help = () => {
  return (
    <>
      <Header />

      <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-12 sm:py-16 md:py-20">
        <div className="max-w-3xl mx-auto space-y-10">
          {}
          <div className="text-center space-y-4">
            <h1 className="text-3xl md:text-5xl font-semibold text-slate-900 leading-tight pb-3 pt-10 sm:pt-12 md:pt-16">
              Help & FAQ
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl">
              Quick answers for diners, queues, reservations, and business
              tools.
            </p>
          </div>

          {}
          <div className="space-y-8">
            <FaqSection
              title="For Customers"
              icon={<Users className="h-5 w-5" />}
              faqs={CUSTOMER_FAQS}
              idPrefix="customer"
            />
            <FaqSection
              title="For Businesses"
              icon={<Store className="h-5 w-5" />}
              faqs={BUSINESS_FAQS}
              idPrefix="business"
            />
          </div>

          {}
          <div className="text-center pt-6 border-t">
            <p className="text-muted-foreground">
              Still need help? Contact us anytime at{" "}
              <a
                href="mailto:help@seatping.biz"
                className="underline font-medium"
              >
                help@seatping.biz
              </a>
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
};

export default Help;
