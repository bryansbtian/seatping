import BusinessComingSoon from "@/components/BusinessComingSoon";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";

const BusinessQueue = () => (
  <>
    <SEO
      title="Business Queue | SeatPing"
      description={BUSINESS_DESCRIPTION}
      image={BUSINESS_IMAGE}
    />
    <BusinessComingSoon titleKey="nav.queue" />
  </>
);

export default BusinessQueue;
