import React from "react";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { COMPANY } from "@/data/company";

export const metadata = {
  title: "Return Policy - Poland Exim",
  description:
    "What can be returned, the time frame for raising a return, how replacements work, and which items are not eligible.",
};

export default function ReturnPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Policy"
      title="Return Policy"
      lastUpdated="20 November 2026"
      intro={
        <>
          Sanitaryware is fragile and heavy, so returns are handled carefully and within defined
          windows. This policy explains what can be returned, by when, and what happens next.
        </>
      }
    >
      <PolicySection heading="1. Return Window">
        <div className="overflow-x-auto my-2">
          <table className="w-full text-left text-sm border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Reason</th>
                <th className="px-4 py-2.5 font-semibold">Raise Within</th>
                <th className="px-4 py-2.5 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              <tr>
                <td className="px-4 py-2.5">Damaged in transit</td>
                <td className="px-4 py-2.5">
                  <strong>48 hours</strong> of delivery
                </td>
                <td className="px-4 py-2.5">Free replacement or full refund</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Wrong item delivered</td>
                <td className="px-4 py-2.5">
                  <strong>48 hours</strong> of delivery
                </td>
                <td className="px-4 py-2.5">Free replacement or full refund</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Manufacturing defect</td>
                <td className="px-4 py-2.5">
                  <strong>7 days</strong> of delivery
                </td>
                <td className="px-4 py-2.5">Replacement, or refund if unavailable</td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Unused, unopened, changed your mind</td>
                <td className="px-4 py-2.5">
                  <strong>7 days</strong> of delivery
                </td>
                <td className="px-4 py-2.5">Refund less return shipping</td>
              </tr>
            </tbody>
          </table>
        </div>
      </PolicySection>

      <PolicySection heading="2. Please Record an Unboxing Video">
        <p className="font-semibold text-slate-700">
          For damage and wrong-item claims, an unboxing video or clear photographs taken at the time
          of opening are required.
        </p>
        <p>
          This is not bureaucracy for its own sake: ceramics can be damaged in transit without any
          visible damage to the outer carton, and the footage is what lets us claim against the
          courier and replace your item at no cost to you. Without it we may be unable to approve a
          transit-damage claim.
        </p>
      </PolicySection>

      <PolicySection heading="3. Condition of Returned Items">
        <p>To be accepted, a returned item must be:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>in its original packaging, including inner padding and wooden frame where supplied;</li>
          <li>unused and uninstalled, with protective film intact where applicable;</li>
          <li>complete with all fittings, fixings, washers and accessories;</li>
          <li>accompanied by the invoice or order reference.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="4. Items That Cannot Be Returned">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Installed items.</strong> Once a product has been fitted, plumbed or drilled it
            cannot be returned, except under the applicable warranty.
          </li>
          <li>
            <strong>Made-to-order, customised or cut-to-size items</strong>, unless they arrive
            damaged or defective.
          </li>
          <li>
            <strong>Items damaged after delivery</strong> through misuse, incorrect installation or
            the use of harsh chemical cleaners.
          </li>
          <li>
            <strong>Clearance items sold as-is</strong>, where this was stated at the time of
            purchase.
          </li>
        </ul>
        <p>
          Minor dimensional variation in vitreous china, and slight variation in glaze shade between
          production batches, are inherent to the manufacturing process and are not treated as
          defects.
        </p>
      </PolicySection>

      <PolicySection heading="5. How to Raise a Return">
        <ol className="list-decimal pl-5 space-y-1.5">
          <li>
            Contact us within the window above at{" "}
            <a href={`mailto:${COMPANY.email}`} className="text-[#0284C7] underline break-all">
              {COMPANY.email}
            </a>{" "}
            or {COMPANY.phoneDisplay}, quoting your order reference.
          </li>
          <li>Send the unboxing video or photographs where the claim is damage or a wrong item.</li>
          <li>
            We review and respond within <strong>2 business days</strong>.
          </li>
          <li>
            On approval we arrange pickup where the service is available, or share return
            instructions where it is not.
          </li>
          <li>
            The item is inspected on arrival, and the replacement or refund is processed within{" "}
            <strong>3 business days</strong> of inspection.
          </li>
        </ol>
      </PolicySection>

      <PolicySection heading="6. Return Shipping Costs">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>We pay</strong> when the item is damaged, defective or not what you ordered.
          </li>
          <li>
            <strong>You pay</strong> when the return is a change of mind. The cost is shown to you
            before you commit and is deducted from the refund.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="7. Refunds for Returns">
        <p>
          Approved refunds follow the time frames in our{" "}
          <Link href="/refund" className="text-[#0284C7] underline font-medium">
            Refund &amp; Cancellation Policy
          </Link>{" "}
          and are returned to the original payment method.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
