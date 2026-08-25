import BusinessComingSoon from "@/components/BusinessComingSoon";
import SEO, { BUSINESS_DESCRIPTION, BUSINESS_IMAGE } from "@/components/SEO";

const BusinessFloor = () => (
  <>
    <SEO
      title="Business Floor | SeatPing"
      description={BUSINESS_DESCRIPTION}
      image={BUSINESS_IMAGE}
    />
    <BusinessComingSoon titleKey="nav.floor" />
  </>
);

export default BusinessFloor;
