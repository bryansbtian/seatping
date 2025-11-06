import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Demo = () => {
  return (
    <>
      <Header />

      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary/5 via-background to-success/5 px-4 py-3 sm:py-8 md:py-16 lg:py-24 space-y-4 sm:space-y-6 md:space-y-8">
        {/* Title and description */}
        <div className="text-center max-w-2xl mx-auto space-y-4">
          <h1 className="text-3xl md:text-5xl font-semibold text-primary leading-tight pb-3">
            See SeatPing in Action
          </h1>
          <p className="text-muted-foreground text-lg md:text-xl">
            Watch our quick demo to learn how SeatPing helps you manage queues,
            notify guests, and keep operations smooth.
          </p>
        </div>

        {/* Video section */}
        {/* <div className="w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-lg border bg-black">
          <iframe
            src="https://www.youtube.com/embed/dQw4w9WgXcQ" // <-- Replace with your actual demo video link
            title="SeatPing Demo Video"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
          ></iframe>
        </div> */}
      </div>

      <Footer />
    </>
  );
};

export default Demo;
