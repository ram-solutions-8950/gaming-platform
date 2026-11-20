import React from "react";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { COMPANY } from "@/data/company";

export const metadata = {
  title: "Refund & Cancellation Policy - Poland Exim",
  description:
    "Order cancellation windows, refund eligibility and the time frames in which Poland Exim processes refunds back to your original payment method.",
};

export default function RefundPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Policy"
      title="Refund & Cancellation Policy"
      lastUpdated="20 November 2026"
      intro={
        <>
          This policy sets out when an order can be cancelled, when a refund is due, and how long a
          refund takes to reach you. It applies to all orders placed with {COMPANY.legalName}.
        </>
      }
    >
      <PolicySection heading="1. Cancelling an Order">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Before dispatch:</strong> you may cancel for any reason and receive a full
            refund. Contact us as soon as possible with your order reference.
          </li>
          <li>
            <strong>After dispatch:</strong> the order can no longer be cancelled, but it may be
            eligible for return once delivered. See our{" "}
            <Link href="/returns" className="text-[#0284C7] underline font-medium">
              Return Policy
            </Link>
            .
          </li>
        </ul>
        <p>
          We may cancel an order ourselves if the item is out of stock, if the delivery address is
          not serviceable, or if we cannot verify the payment. In every such case the full amount is
          refunded.
        </p>
      </PolicySection>

      <PolicySection heading="2. When a Refund Is Due">
        <p>A refund is issued where:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>you cancelled the order before dispatch;</li>
          <li>we cancelled the order for any reason;</li>
          <li>the item arrived damaged, defective or incorrect;</li>
          <li>the item could not be delivered after reasonable attempts;</li>
          <li>an approved return has been received and inspected.</li>
        </ul>
      </PolicySection>

      <PolicySection heading="3. Refund Time Frames">
        <div className="overflow-x-auto my-2">
          <table className="w-full text-left text-sm border border-slate-200 rounded-xl overflow-hidden">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Stage</th>
                <th className="px-4 py-2.5 font-semibold">Time Frame</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-slate-600">
              <tr>
                <td className="px-4 py-2.5">Refund approved and initiated by us</td>
                <td className="px-4 py-2.5">
                  Within <strong>3 business days</strong> of approval
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Credited back by your bank / UPI provider</td>
                <td className="px-4 py-2.5">
                  A further <strong>5 to 7 business days</strong>
                </td>
              </tr>
              <tr>
                <td className="px-4 py-2.5">Total, from approval to credit</td>
                <td className="px-4 py-2.5">
                  Usually <strong>7 to 10 business days</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Once we initiate a refund we will share the reference number. The final leg is handled by
          your bank or UPI provider and its timing is outside our control. If the amount has not
          reached you 10 business days after we shared the reference, contact us and we will raise it
          with the gateway.
        </p>
      </PolicySection>

      <PolicySection heading="4. How Refunds Are Paid">
        <p>
          Refunds are always returned to the <strong>original payment method</strong> used for the
          order — the same card, UPI ID or bank account. We cannot redirect a refund to a different
          account, as this is a condition imposed by the payment gateways for fraud prevention.
        </p>
        <p>
          Where the original method is no longer active, the refund is returned to the issuing bank,
          which will credit the linked account.
        </p>
      </PolicySection>

      <PolicySection heading="5. Failed and Deducted Payments">
        <p>
          If money left your account but the order did not confirm, the amount is normally
          auto-reversed by your bank within 5 to 7 business days without any action from you. If it
          is not, send us your transaction reference (UTR) through our{" "}
          <Link href="/payment-issues" className="text-[#0284C7] underline font-medium">
            Payment Issues desk
          </Link>{" "}
          and we will trace it with the gateway.
        </p>
      </PolicySection>

      <PolicySection heading="6. Deductions">
        <p>
          Full refunds are made for cancellations before dispatch and for damaged, defective or
          incorrect items, with no deduction. For returns made for other reasons, return shipping
          may be deducted where stated in our{" "}
          <Link href="/returns" className="text-[#0284C7] underline font-medium">
            Return Policy
          </Link>
          . Any deduction is shown to you before the refund is processed.
        </p>
      </PolicySection>

      <PolicySection heading="7. Raising a Refund Request">
        <p>
          Email{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-[#0284C7] underline break-all">
            {COMPANY.email}
          </a>{" "}
          or call {COMPANY.phoneDisplay} with your order reference and the reason for the request.
          We acknowledge every request within <strong>2 business days</strong>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
