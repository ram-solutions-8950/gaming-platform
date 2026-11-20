import React from "react";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/PolicyPage";
import { COMPANY } from "@/data/company";

export const metadata = {
  title: "Privacy Policy - Poland Exim",
  description:
    "How Poland Exim collects, uses, stores and protects your personal information, and the rights you have over it.",
};

export default function PrivacyPolicyPage() {
  return (
    <PolicyPage
      eyebrow="Policy"
      title="Privacy Policy"
      lastUpdated="20 November 2026"
      intro={
        <>
          {COMPANY.legalName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) respects your privacy. This policy
          explains what personal information we collect when you use this website, why we collect it,
          who we share it with, and what control you have over it.
        </>
      }
    >
      <PolicySection heading="1. Information We Collect">
        <p>We collect only what we need to process an order and support you afterwards:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Contact details</strong> you provide: name, email address, phone number and
            delivery address.
          </li>
          <li>
            <strong>Order information</strong>: the items ordered, the amount, and the order
            reference.
          </li>
          <li>
            <strong>Communications</strong>: messages you send us by email, phone or WhatsApp, and
            any support tickets you raise.
          </li>
          <li>
            <strong>Technical information</strong> your browser sends automatically, such as IP
            address, device type and pages visited, used to keep the site secure and working.
          </li>
        </ul>
        <p className="font-semibold text-slate-700">
          We never collect or store your full card number, CVV, UPI PIN or net-banking password.
          Those are entered directly on the payment gateway&rsquo;s own secure page and are never
          visible to us.
        </p>
      </PolicySection>

      <PolicySection heading="2. How We Use Your Information">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>To process, confirm and deliver your order.</li>
          <li>To issue invoices and process refunds where applicable.</li>
          <li>To respond to your enquiries and provide after-sales support.</li>
          <li>To detect and prevent fraudulent or unauthorised transactions.</li>
          <li>To meet our legal, tax and accounting obligations.</li>
        </ul>
        <p>
          We do not sell your personal information, and we do not share it with third parties for
          their own marketing.
        </p>
      </PolicySection>

      <PolicySection heading="3. Payment Processing">
        <p>
          Payments are processed by RBI-authorised payment gateways. When you pay, you are taken to
          the gateway&rsquo;s secure environment, and the gateway receives the details needed to
          complete the transaction. Their handling of that data is governed by their own privacy
          policy. We receive only the outcome of the payment and a transaction reference.
        </p>
      </PolicySection>

      <PolicySection heading="4. Who We Share Information With">
        <p>We share personal information only where it is necessary, and only with:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>payment gateways, to process your transaction;</li>
          <li>logistics and courier partners, to deliver your order;</li>
          <li>
            professional advisers, auditors and government authorities, where we are required to do
            so by law or to establish or defend a legal claim.
          </li>
        </ul>
      </PolicySection>

      <PolicySection heading="5. How Long We Keep It">
        <p>
          Order and invoice records are retained for as long as required under applicable Indian tax
          and company law. Enquiries and support correspondence are retained only as long as needed
          to resolve the matter and for a reasonable period afterwards. Information no longer needed
          is deleted or anonymised.
        </p>
      </PolicySection>

      <PolicySection heading="6. Security">
        <p>
          The site is served over encrypted HTTPS connections. Access to personal information is
          restricted to the personnel who need it to perform their role. No method of transmission
          or storage is completely secure, so while we take reasonable steps to protect your
          information, we cannot guarantee absolute security.
        </p>
      </PolicySection>

      <PolicySection heading="7. Cookies">
        <p>
          We use only the cookies necessary for the site to function, such as keeping your session
          and your cart working while you browse. You can block cookies in your browser settings,
          but parts of the checkout may then stop working.
        </p>
      </PolicySection>

      <PolicySection heading="8. Your Rights">
        <p>You may contact us at any time to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>ask what personal information we hold about you;</li>
          <li>have inaccurate information corrected;</li>
          <li>
            request deletion of information we are not legally required to keep;
          </li>
          <li>withdraw consent to any optional processing.</li>
        </ul>
        <p>
          Write to us at{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-[#0284C7] underline break-all">
            {COMPANY.email}
          </a>{" "}
          and we will respond within 30 days.
        </p>
      </PolicySection>

      <PolicySection heading="9. Children">
        <p>
          This site is not directed at children under 18, and we do not knowingly collect their
          personal information. If you believe a child has provided us information, contact us and
          we will delete it.
        </p>
      </PolicySection>

      <PolicySection heading="10. Changes to This Policy">
        <p>
          We may update this policy from time to time. The &ldquo;Last Updated&rdquo; date above
          reflects the current version. Material changes will be posted on this page.
        </p>
        <p>
          See also our{" "}
          <Link href="/terms" className="text-[#0284C7] underline font-medium">
            Terms &amp; Conditions
          </Link>
          ,{" "}
          <Link href="/refund" className="text-[#0284C7] underline font-medium">
            Refund &amp; Cancellation Policy
          </Link>
          ,{" "}
          <Link href="/returns" className="text-[#0284C7] underline font-medium">
            Return Policy
          </Link>{" "}
          and{" "}
          <Link href="/shipping" className="text-[#0284C7] underline font-medium">
            Shipping Policy
          </Link>
          .
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
