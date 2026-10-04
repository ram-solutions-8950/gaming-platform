import { NextRequest, NextResponse } from "next/server";
import { PRODUCTS } from "@/data/products";

export async function POST(req: NextRequest) {
  try {
    const { productId } = await req.json();

    if (!productId) {
      return NextResponse.json(
        { error: "Product ID is required." },
        { status: 400 }
      );
    }

    const product = PRODUCTS.find((p) => p.id === productId);
    if (!product) {
      return NextResponse.json(
        { error: "Product not found in catalog." },
        { status: 404 }
      );
    }

    const appId = process.env.CASHFREE_APP_ID;
    const secretKey = process.env.CASHFREE_SECRET_KEY;
    const mode = process.env.NEXT_PUBLIC_CASHFREE_MODE || "sandbox";

    const orderId = `AQ_${Date.now()}`;
    const baseUrl =
      mode === "production"
        ? "https://api.cashfree.com/pg/orders"
        : "https://sandbox.cashfree.com/pg/orders";

    // If real credentials are provided
    if (
      appId &&
      secretKey &&
      appId !== "your_cashfree_app_id_here" &&
      secretKey !== "your_cashfree_secret_key_here"
    ) {
      const origin = req.headers.get("origin") || "http://localhost:3001";
      const payload = {
        order_id: orderId,
        order_amount: product.price,
        order_currency: "INR",
        customer_details: {
          customer_id: `CUST_${Date.now()}`,
          customer_name: "AquaSan Shopper",
          customer_email: "shopper@aquasan.com",
          customer_phone: "9876543210",
        },
        order_meta: {
          return_url: `${origin}/?order_id={order_id}`,
        },
      };

      const response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "x-client-id": appId,
          "x-client-secret": secretKey,
          "x-api-version": "2023-08-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        return NextResponse.json(
          {
            error: data.message || "Failed to create Cashfree order.",
            details: data,
          },
          { status: response.status }
        );
      }

      return NextResponse.json({
        paymentSessionId: data.payment_session_id,
        orderId: data.order_id,
        mode: mode,
      });
    }

    // Seamless fallback simulation for local testing when keys are placeholders
    return NextResponse.json({
      paymentSessionId: `session_cf_mock_${Date.now()}`,
      orderId: orderId,
      mode: mode,
      isSimulated: true,
      note: "Set your real CASHFREE_APP_ID and CASHFREE_SECRET_KEY in .env.local to invoke live Cashfree sandbox.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Internal server error." },
      { status: 500 }
    );
  }
}
