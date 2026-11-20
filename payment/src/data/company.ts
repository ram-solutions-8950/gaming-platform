/**
 * Registered business identity, as per the submitted incorporation and
 * KYC documents. This is the single source of truth for the legal name,
 * registered address and contact details shown anywhere on the site --
 * update it here rather than hard-coding the values in a component, so
 * the footer, contact page and grievance desk cannot drift apart.
 */
export const COMPANY = {
  /** Registered legal / business name. */
  legalName: "Poland Exim",
  /** Trading name shown in the storefront UI.
   *  Kept identical to the legal name so the site, the browser tab and the
   *  submitted documents all say the same thing. */
  tradeName: "Poland Exim",

  /** Registered address, as a single line. */
  addressLine:
    "First Floor, Shop No. 112, Shivalik Chamber - 1, NH 27, Shakti Chamber, Trajpar, Survey No. 47, Plot No. 36 and 37, Morbi, Gujarat 363642, India",

  /** Registered address, broken out for multi-line display. */
  address: {
    line1: "First Floor, Shop No. 112, Shivalik Chamber - 1",
    line2: "NH 27, Shakti Chamber, Trajpar",
    line3: "Survey No. 47, Plot No. 36 and 37",
    city: "Morbi",
    district: "Morbi",
    state: "Gujarat",
    postalCode: "363642",
    country: "India",
  },

  /** Primary contact phone, in E.164 and display forms. */
  phone: "+919587018430",
  phoneDisplay: "+91 95870 18430",

  /** Primary contact / grievance email. */
  email: "ramsolutionsdelhi@gmail.com",

  /** Courts with jurisdiction over disputes (the registered office). */
  jurisdiction: "Morbi, Gujarat, India",

  /** Published support hours. */
  supportHours: "Mon - Sat: 9:00 AM - 7:00 PM IST",
} as const;
