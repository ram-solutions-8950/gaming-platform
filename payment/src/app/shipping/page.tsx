import React from "react";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { COMPANY } from "@/data/company";

export const metadata = {
  title: "Shipping Policy - Poland Exim",
  description:
    "Dispatch and delivery time frames, shipping charges, packaging, tracking and what to do if a consignment arrives damaged.",
};

export default function ShippingPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Policy"
      title="Shipping Policy"
      lastUpdated="20 November 2026"
      intro={
        <>
          Orders are dispatched from our facility in {COMPANY.address.city},{" "}
          {COMPANY.address.state}. This policy sets out how long dispatch and delivery take, what
          shipping costs, and how consignments are packed and tracked.
        </>
      }
    >
      <PolicySection heading="1. Dispatch Time Frame">
        <p>
          Orders are processed on business days (Monday to Saturday, excluding public holidays).
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Orders confirmed before <strong>2:00 PM IST</strong> on a business day are normally
            dispatched within <strong>1 to 2 business days</strong>.
          </li>
          <li>
            Orders confirmed after that, or on a Sunday or public holiday, are processed on the next
            business day.
          </li>
          <li>
            Bulk, made-to-order and customised items may take <strong>5 to 7 business days</strong>{" "}
            to dispatch. Where this applies it is confirmed to you at the time of order.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="2. Delivery Time Frame">
        <p>Estimated transit time after dispatch:</p>
        <div className="overflow-x-auto my-2">
          <table className="w-full text-left text-sm border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Destination</th>
                <th className="px-4 py-2.5 font-semibold">Estimated Delivery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              <tr>
                <td className="px-4 py-2.5">Within Gujarat</td>
                <td className="px-4 py-2.5">
                  <strong>2 to 4 business days</strong>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Metro cities</td>
                <td className="px-4 py-2.5">
                  <strong>4 to 7 business days</strong>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Rest of India</td>
                <td className="px-4 py-2.5">
                  <strong>5 to 10 business days</strong>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Remote, hill and north-eastern areas</td>
                <td className="px-4 py-2.5">
                  <strong>7 to 14 business days</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="font-semibold text-slate-700">
          These are estimates, not guarantees.
        </p>
        <p>
          Sanitaryware moves by surface freight because of its weight and fragility, and transit can
          be extended by weather, strikes, regional restrictions or courier backlogs during festival
          periods. We will tell you if we know your consignment is running late.
        </p>
      </PolicySection>

      <PolicySection heading="3. Shipping Charges">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Shipping charges, where applicable, are calculated on weight, volume and destination
            pincode, and are shown before you confirm payment.
          </li>
          <li>Any free-shipping threshold in effect is stated on the product or checkout page.</li>
          <li>
            Prices shown are inclusive of GST. A GST invoice is issued with every order.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="4. Packaging">
        <p>
          Fragile ceramics are packed in multi-ply honeycomb cartons with inner padding, and
          reinforced with wooden pallet framing where the item&rsquo;s size or weight requires it.
          Chrome and brass fittings are individually wrapped to prevent surface scratching in
          transit.
        </p>
      </PolicySection>

      <PolicySection heading="5. Tracking">
        <p>
          Once your consignment is handed to the courier we share the tracking number and carrier by
          email or WhatsApp. Tracking can take up to 24 hours to begin updating after dispatch.
        </p>
      </PolicySection>

      <PolicySection heading="6. Delivery, Inspection and Damage">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            Please ensure someone is available at the delivery address. Large consignments may need
            help to move from the vehicle.
          </li>
          <li>
            <strong>Inspect the carton before accepting it.</strong> If the packaging is visibly
            crushed, punctured or opened, note it on the courier&rsquo;s delivery sheet, or refuse
            the delivery and tell us the same day.
          </li>
          <li>
            Record an unboxing video. Transit damage to ceramics is often invisible from the outside
            of the carton, and the footage is what allows us to replace the item at no cost to you.
          </li>
          <li>
            Report any damage within <strong>48 hours</strong> of delivery under our{" "}
            <Link href="/returns" className="text-[#0284C7] underline font-medium">
              Return Policy
            </Link>
            .
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="7. Incorrect Addresses and Failed Delivery">
        <p>
          Please check your delivery address and phone number before confirming. If a consignment is
          returned to us because the address was incorrect or nobody was available after reasonable
          attempts, we will contact you to arrange redelivery. Redelivery charges may apply.
        </p>
      </PolicySection>

      <PolicySection heading="8. Serviceability">
        <p>
          We deliver across India through our courier and freight partners. A small number of
          pincodes are not serviceable for heavy freight. If yours is one of them we will tell you
          promptly and refund the order in full under our{" "}
          <Link href="/refund" className="text-[#0284C7] underline font-medium">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
