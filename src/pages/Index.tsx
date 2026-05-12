import { useState } from "react";
import Header       from "@/components/Header";
import Hero         from "@/components/Hero";
import Services     from "@/components/Services";
import Benefits     from "@/components/Benefits";
import Testimonials from "@/components/Testimonials";
import Footer       from "@/components/Footer";
import BookingModal from "@/components/BookingModal";

const Index = () => {
  const [bookingOpen,  setBookingOpen]  = useState(false);
  const [meetingType,  setMeetingType]  = useState("Diagnóstico Gratis");

  const openBooking = (type = "Diagnóstico Gratis") => {
    setMeetingType(type);
    setBookingOpen(true);
  };

  return (
    <div className="min-h-screen">
      <Header       onOpenBooking={openBooking} />
      <Hero         onOpenBooking={openBooking} />
      <Services     onOpenBooking={openBooking} />
      <Benefits />
      <Testimonials />
      <Footer       onOpenBooking={openBooking} />

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        meetingType={meetingType}
      />
    </div>
  );
};

export default Index;
