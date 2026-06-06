import Hero from '@/components/Hero';
import ValueProps from '@/components/ValueProps';
import Install from '@/components/Install';
import Pricing from '@/components/Pricing';
import Faq from '@/components/Faq';
import Footer from '@/components/Footer';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16 space-y-24">
      <Hero />
      <ValueProps />
      <Install />
      <Pricing />
      <Faq />
      <Footer />
    </main>
  );
}
