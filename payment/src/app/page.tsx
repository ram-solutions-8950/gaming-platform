import { Header } from "@/components/Header";
import { CheckoutContainer } from "@/components/CheckoutContainer";
import { Footer } from "@/components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[#F8FAFC]">
      <Header />
      <div className="flex-1">
        <CheckoutContainer />
      </div>
      <Footer />
    </div>
  );
}
