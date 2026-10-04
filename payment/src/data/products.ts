export interface Product {
  id: string;
  name: string;
  price: number;
  formattedPrice: string;
  badge?: string;
  description: string;
  category: string;
  imageType: "one-piece-toilet" | "wall-hung-toilet" | "wash-basin" | "basin-tap" | "shower-set" | "led-mirror" | "flush-tank";
  imageUrl: string;
}

export const PRODUCTS: Product[] = [
  {
    id: "shower-system",
    name: "Polished Chrome Shower System",
    price: 4999,
    formattedPrice: "₹4,999",
    badge: "Bestseller",
    description: "Multi-function luxury shower system featuring rainfall overhead shower, handheld sprayer, and precision brass diverter valve.",
    category: "Showers",
    imageType: "shower-set",
    imageUrl: "/prod-page/shower-system.webp",
  },
  {
    id: "ceramic-sink",
    name: "Modern Ceramic Sink & Faucet",
    price: 3999,
    formattedPrice: "₹3,999",
    badge: "Popular",
    description: "Premium countertop ceramic wash basin paired with a tall sleek single-handle chrome mixer faucet with anti-stain high-gloss glaze.",
    category: "Basins",
    imageType: "wash-basin",
    imageUrl: "/prod-page/ceramic-sink.webp",
  },
  {
    id: "bathroom-faucet",
    name: "Chrome Single-Handle Faucet",
    price: 1899,
    formattedPrice: "₹1,899",
    description: "Solid brass single-handle bathroom mixer tap with mirror chrome finish and water-efficient smooth aerator.",
    category: "Faucets",
    imageType: "basin-tap",
    imageUrl: "/prod-page/bathroom-faucet.webp",
  },
  {
    id: "vanity-cabinet",
    name: "Modern LED Vanity Cabinet",
    price: 12499,
    formattedPrice: "₹12,499",
    badge: "Luxury",
    description: "Smart bathroom vanity cabinet with ambient LED mirror, dual storage drawers, and water-resistant high-gloss finish.",
    category: "Vanities",
    imageType: "led-mirror",
    imageUrl: "/prod-page/vanity-cabinet.webp",
  },
  {
    id: "bidet-sprayer",
    name: "Chrome Bidet Sprayer Set",
    price: 1499,
    formattedPrice: "₹1,499",
    description: "Ergonomic handheld hygiene bidet sprayer with flexible coiled hose and wall mounting bracket for modern bathrooms.",
    category: "Hygiene",
    imageType: "one-piece-toilet",
    imageUrl: "/prod-page/bidet-sprayer.webp",
  },
  {
    id: "towel-rack",
    name: "Chrome Towel Rack Set",
    price: 2199,
    formattedPrice: "₹2,199",
    description: "Heavy-duty dual-tier stainless steel chrome towel shelf with hanging bar for organized modern bathrooms.",
    category: "Hardware",
    imageType: "flush-tank",
    imageUrl: "/prod-page/towel-rack.webp",
  },
  {
    id: "towel-ring",
    name: "Chrome Towel Ring Holder",
    price: 899,
    formattedPrice: "₹899",
    description: "Minimalist circular wall-mount hand towel ring with anti-corrosion chrome coating and smooth pivoting ring.",
    category: "Hardware",
    imageType: "wall-hung-toilet",
    imageUrl: "/prod-page/towel-ring.webp",
  },
];

export interface PaymentOption {
  id: "upi" | "card" | "netbanking" | "wallets";
  name: string;
  subtitle: string;
  iconType: "upi" | "card" | "netbanking" | "wallet";
  brands: ("phonepe" | "gpay" | "paytm" | "bhim" | "visa" | "mastercard" | "rupay" | "amazonpay" | "mobikwik")[];
}

export const PAYMENT_METHODS: PaymentOption[] = [
  {
    id: "upi",
    name: "UPI",
    subtitle: "PhonePe, Google Pay, Paytm, BHIM",
    iconType: "upi",
    brands: ["phonepe", "gpay", "paytm"],
  },
  {
    id: "card",
    name: "Debit / Credit Card",
    subtitle: "Visa, MasterCard, RuPay",
    iconType: "card",
    brands: ["visa", "mastercard", "rupay"],
  },
  {
    id: "netbanking",
    name: "Net Banking",
    subtitle: "All major banks supported",
    iconType: "netbanking",
    brands: [],
  },
  {
    id: "wallets",
    name: "Wallets",
    subtitle: "Paytm, Amazon Pay, Mobikwik",
    iconType: "wallet",
    brands: ["paytm", "amazonpay", "mobikwik"],
  },
];
