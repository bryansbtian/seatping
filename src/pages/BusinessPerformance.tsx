import BusinessComingSoon from "@/components/BusinessComingSoon";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";

const BusinessPerformance = () => (
  <>
    <SEO
      title="Business Performance | SeatPing"
      description={BUSINESS_DESCRIPTION}
      image={BUSINESS_IMAGE}
    />
    <BusinessComingSoon titleKey="nav.performance" />
  </>
);

export default BusinessPerformance;
